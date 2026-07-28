import fs from "node:fs/promises";

const TUS_VERSION = "1.0.0";
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
const DEFAULT_RETRY_DELAYS_MS = Object.freeze([0, 3000, 5000, 10000, 20000]);

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function base64(value) {
  return Buffer.from(String(value), "utf8").toString("base64");
}

function uploadMetadata(values = {}) {
  return Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key} ${base64(value)}`)
    .join(",");
}

function projectReference(supabaseUrl) {
  const hostname = new URL(supabaseUrl).hostname;
  const suffix = ".supabase.co";
  if (!hostname.endsWith(suffix)) {
    throw new Error("SUPABASE_PROJECT_REFERENCE_UNRESOLVED");
  }
  const reference = hostname.slice(0, -suffix.length);
  if (!reference) throw new Error("SUPABASE_PROJECT_REFERENCE_UNRESOLVED");
  return reference;
}

function resumableEndpoint(supabaseUrl) {
  return `https://${projectReference(supabaseUrl)}.storage.supabase.co/storage/v1/upload/resumable`;
}

async function responseMessage(response) {
  const body = await response.text().catch(() => "");
  return body || `${response.status} ${response.statusText}`;
}

function authHeaders(serviceRoleKey) {
  return {
    authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };
}

async function sleep(milliseconds) {
  if (milliseconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

async function uploadOffset(uploadUrl, serviceRoleKey) {
  const response = await fetch(uploadUrl, {
    method: "HEAD",
    headers: {
      ...authHeaders(serviceRoleKey),
      "tus-resumable": TUS_VERSION,
    },
  });
  if (!response.ok) {
    throw new Error(`CREATIVE_TUS_HEAD_FAILED:${await responseMessage(response)}`);
  }
  const offset = positiveInteger(response.headers.get("upload-offset")) ?? 0;
  return offset;
}

async function createUpload({
  supabaseUrl,
  serviceRoleKey,
  bucket,
  storagePath,
  sizeBytes,
  contentType,
  cacheControl = "3600",
  metadata = {},
  upsert = true,
}) {
  const response = await fetch(resumableEndpoint(supabaseUrl), {
    method: "POST",
    headers: {
      ...authHeaders(serviceRoleKey),
      "tus-resumable": TUS_VERSION,
      "upload-length": String(sizeBytes),
      "upload-metadata": uploadMetadata({
        bucketName: bucket,
        objectName: storagePath,
        contentType,
        cacheControl,
        metadata: JSON.stringify(metadata || {}),
      }),
      "x-upsert": upsert ? "true" : "false",
    },
  });

  if (response.status !== 201) {
    const message = await responseMessage(response);
    if (response.status === 413 || /maximum allowed size|too large/i.test(message)) {
      throw new Error(`CREATIVE_STORAGE_LIMIT_REJECTED:${message}`);
    }
    throw new Error(`CREATIVE_TUS_CREATE_FAILED:${message}`);
  }

  const location = response.headers.get("location");
  if (!location) throw new Error("CREATIVE_TUS_UPLOAD_LOCATION_MISSING");
  return new URL(location, resumableEndpoint(supabaseUrl)).toString();
}

async function patchChunk({
  uploadUrl,
  serviceRoleKey,
  offset,
  chunk,
  retryDelaysMs,
}) {
  let lastError = null;

  for (const delay of retryDelaysMs) {
    await sleep(delay);
    try {
      const response = await fetch(uploadUrl, {
        method: "PATCH",
        headers: {
          ...authHeaders(serviceRoleKey),
          "tus-resumable": TUS_VERSION,
          "upload-offset": String(offset),
          "content-type": "application/offset+octet-stream",
        },
        body: chunk,
      });

      if (response.status === 204) {
        return positiveInteger(response.headers.get("upload-offset")) ?? (offset + chunk.length);
      }

      const message = await responseMessage(response);
      if (response.status === 409) {
        return uploadOffset(uploadUrl, serviceRoleKey);
      }
      if (response.status === 413 || /maximum allowed size|too large/i.test(message)) {
        throw new Error(`CREATIVE_STORAGE_LIMIT_REJECTED:${message}`);
      }
      throw new Error(`CREATIVE_TUS_PATCH_FAILED:${message}`);
    } catch (error) {
      lastError = error;
      if (text(error?.message).startsWith("CREATIVE_STORAGE_LIMIT_REJECTED")) {
        throw error;
      }
      try {
        return await uploadOffset(uploadUrl, serviceRoleKey);
      } catch {
        // Retry using the configured delay sequence.
      }
    }
  }

  throw lastError || new Error("CREATIVE_TUS_PATCH_FAILED");
}

export async function ensureCreativeBucketCapacity({
  supabase,
  bucket,
  requiredBytes,
}) {
  const required = positiveInteger(requiredBytes);
  if (!required) throw new Error("CREATIVE_STORAGE_REQUIRED_BYTES_INVALID");

  const { data: current, error: readError } = await supabase.storage.getBucket(bucket);
  if (readError || !current) {
    throw new Error(`CREATIVE_STORAGE_BUCKET_READ_FAILED:${readError?.message || "missing"}`);
  }

  const currentLimit = positiveInteger(
    current.file_size_limit ?? current.fileSizeLimit,
  );
  if (!currentLimit || currentLimit >= required) {
    return {
      bucket,
      changed: false,
      previous_limit_bytes: currentLimit,
      effective_limit_bytes: currentLimit,
    };
  }

  const allowedMimeTypes = Array.isArray(current.allowed_mime_types)
    ? current.allowed_mime_types
    : Array.isArray(current.allowedMimeTypes)
      ? current.allowedMimeTypes
      : null;

  const { error: updateError } = await supabase.storage.updateBucket(bucket, {
    public: current.public === true,
    allowedMimeTypes,
    fileSizeLimit: required,
  });

  if (updateError) {
    throw new Error(
      `CREATIVE_STORAGE_BUCKET_LIMIT_UPDATE_FAILED:required=${required}:current=${currentLimit}:${updateError.message}`,
    );
  }

  const { data: verified, error: verifyError } = await supabase.storage.getBucket(bucket);
  if (verifyError || !verified) {
    throw new Error(`CREATIVE_STORAGE_BUCKET_LIMIT_VERIFY_FAILED:${verifyError?.message || "missing"}`);
  }

  const verifiedLimit = positiveInteger(
    verified.file_size_limit ?? verified.fileSizeLimit,
  );
  if (verifiedLimit && verifiedLimit < required) {
    throw new Error(
      `CREATIVE_STORAGE_BUCKET_LIMIT_STILL_TOO_SMALL:required=${required}:actual=${verifiedLimit}`,
    );
  }

  return {
    bucket,
    changed: true,
    previous_limit_bytes: currentLimit,
    effective_limit_bytes: verifiedLimit,
  };
}

export async function uploadCreativeFileResumable({
  supabaseUrl,
  serviceRoleKey,
  filePath,
  bucket,
  storagePath,
  contentType,
  metadata = {},
  cacheControl = "3600",
  upsert = true,
  onProgress = null,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
}) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error("CREATIVE_RESUMABLE_SOURCE_FILE_INVALID");
  }

  const uploadUrl = await createUpload({
    supabaseUrl,
    serviceRoleKey,
    bucket,
    storagePath,
    sizeBytes: stat.size,
    contentType,
    cacheControl,
    metadata,
    upsert,
  });

  const handle = await fs.open(filePath, "r");
  let offset = 0;

  try {
    while (offset < stat.size) {
      const length = Math.min(TUS_CHUNK_BYTES, stat.size - offset);
      const chunk = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(chunk, 0, length, offset);
      if (bytesRead !== length) {
        throw new Error(
          `CREATIVE_RESUMABLE_SOURCE_READ_INCOMPLETE:expected=${length}:actual=${bytesRead}`,
        );
      }

      const nextOffset = await patchChunk({
        uploadUrl,
        serviceRoleKey,
        offset,
        chunk,
        retryDelaysMs,
      });

      if (nextOffset < offset || nextOffset > stat.size) {
        throw new Error(
          `CREATIVE_TUS_OFFSET_INVALID:previous=${offset}:next=${nextOffset}:size=${stat.size}`,
        );
      }
      if (nextOffset === offset) {
        throw new Error(`CREATIVE_TUS_OFFSET_DID_NOT_ADVANCE:${offset}`);
      }

      offset = nextOffset;
      if (typeof onProgress === "function") {
        onProgress({
          uploadedBytes: offset,
          totalBytes: stat.size,
          percentage: Number(((offset / stat.size) * 100).toFixed(2)),
        });
      }
    }
  } finally {
    await handle.close();
  }

  return {
    bucket,
    storage_path: storagePath,
    size_bytes: stat.size,
    chunk_size_bytes: TUS_CHUNK_BYTES,
    upload_url_created: true,
  };
}
