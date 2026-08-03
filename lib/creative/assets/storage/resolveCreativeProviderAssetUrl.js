import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

const STORAGE_PREFIX = "storage://";
const SUPABASE_STORAGE_MARKER = "/storage/v1/object/";

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function storageReference(value) {
  const source = text(value);
  if (!source.startsWith(STORAGE_PREFIX)) return null;
  const remainder = source.slice(STORAGE_PREFIX.length);
  const separator = remainder.indexOf("/");
  if (separator <= 0 || separator === remainder.length - 1) {
    throw new Error("CREATIVE_STORAGE_REFERENCE_INVALID");
  }
  return {
    bucket: remainder.slice(0, separator),
    path: remainder.slice(separator + 1),
  };
}

function supabaseStorageHttpReference(value) {
  const source = text(value);
  if (!/^https:\/\//i.test(source)) return null;

  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    return null;
  }

  const markerIndex = parsed.pathname.indexOf(SUPABASE_STORAGE_MARKER);
  if (markerIndex < 0) return null;

  const remainder = parsed.pathname.slice(
    markerIndex + SUPABASE_STORAGE_MARKER.length,
  );
  const segments = remainder.split("/").filter(Boolean);
  if (["public", "sign", "authenticated"].includes(segments[0])) {
    segments.shift();
  }
  if (segments.length < 2) return null;

  const bucket = decodePathSegment(segments.shift());
  const path = segments.map(decodePathSegment).join("/");
  if (!bucket || !path) return null;
  return { bucket, path };
}

function providerStorageReference(value) {
  return storageReference(value) || supabaseStorageHttpReference(value);
}

function directUrl(value) {
  if (typeof value === "string") return text(value);
  if (!value || typeof value !== "object") return "";
  return text(
    value.file_url ||
    value.fileUrl ||
    value.image_url ||
    value.imageUrl ||
    value.video_url ||
    value.videoUrl ||
    value.audio_url ||
    value.audioUrl ||
    value.url,
  );
}

function assetId(value) {
  if (typeof value === "string") return text(value);
  if (!value || typeof value !== "object") return "";
  return text(
    value.asset_id ||
    value.assetId ||
    value.creative_asset_id ||
    value.creativeAssetId ||
    value.id,
  );
}

function assetStorageReference(asset = {}) {
  const explicit = text(
    asset.storage_reference ||
    asset.storageReference ||
    asset.metadata?.storage_reference ||
    asset.metadata?.storageReference ||
    asset.analysis?.storage_evidence?.storage_reference,
  );
  if (explicit.startsWith(STORAGE_PREFIX)) return explicit;

  const path = text(
    asset.storage_path ||
    asset.storagePath ||
    asset.metadata?.storage_path ||
    asset.metadata?.storagePath ||
    asset.analysis?.storage_evidence?.storage_path,
  );
  const bucket = text(
    asset.storage_bucket ||
    asset.storageBucket ||
    asset.metadata?.storage_bucket ||
    asset.metadata?.storageBucket ||
    asset.analysis?.storage_evidence?.storage_bucket,
  );
  return path && bucket ? `${STORAGE_PREFIX}${bucket}/${path}` : "";
}

function assertOrganizationStoragePath(organizationId, path) {
  const expectedPrefix = `${organizationId}/`;
  if (!text(path).startsWith(expectedPrefix)) {
    throw new Error("CREATIVE_STORAGE_REFERENCE_ORGANIZATION_MISMATCH");
  }
}

function contentTypeFromPath(path) {
  const normalized = text(path).toLowerCase().split(/[?#]/)[0];
  if (/\.png$/.test(normalized)) return "image/png";
  if (/\.webp$/.test(normalized)) return "image/webp";
  if (/\.(jpg|jpeg)$/.test(normalized)) return "image/jpeg";
  if (/\.gif$/.test(normalized)) return "image/gif";
  if (/\.mp4$/.test(normalized)) return "video/mp4";
  if (/\.mov$/.test(normalized)) return "video/quicktime";
  if (/\.webm$/.test(normalized)) return "video/webm";
  if (/\.mp3$/.test(normalized)) return "audio/mpeg";
  if (/\.wav$/.test(normalized)) return "audio/wav";
  return "application/octet-stream";
}

async function signStorageReference({ organization_id, reference }) {
  const parsed = storageReference(reference);
  if (!parsed) return reference;
  if (!organization_id) throw new Error("organization_id required");

  assertOrganizationStoragePath(organization_id, parsed.path);

  const expiresIn = positiveInteger(
    process.env.CREATIVE_PROVIDER_INPUT_URL_TTL_SECONDS,
  );
  if (!expiresIn) {
    throw new Error("CREATIVE_PROVIDER_INPUT_URL_TTL_SECONDS_REQUIRED");
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) {
    throw new Error("CREATIVE_PROVIDER_INPUT_SIGNED_URL_REQUIRED");
  }
  return data.signedUrl;
}

async function downloadStorageReference({
  organization_id,
  reference,
}) {
  if (!organization_id) throw new Error("organization_id required");
  assertOrganizationStoragePath(organization_id, reference.path);

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(reference.bucket)
    .download(reference.path);
  if (error) {
    throw new Error(
      `CREATIVE_PROVIDER_STORAGE_DOWNLOAD_FAILED:${error.message || error.code || "UNKNOWN"}`,
    );
  }
  if (!data) throw new Error("CREATIVE_PROVIDER_STORAGE_DOWNLOAD_EMPTY");

  const bytes = Buffer.from(await data.arrayBuffer());
  if (!bytes.length) throw new Error("CREATIVE_PROVIDER_STORAGE_FILE_EMPTY");

  return {
    bytes,
    content_type: text(data.type) || contentTypeFromPath(reference.path),
    filename: reference.path.split("/").pop() || "creative-provider-input",
    source_mode: "SUPABASE_STORAGE",
    bucket: reference.bucket,
    path: reference.path,
  };
}

export async function downloadCreativeProviderAssetSource({
  organization_id,
  source,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  const resolvedSource = text(source);
  if (!resolvedSource) throw new Error("CREATIVE_PROVIDER_INPUT_SOURCE_REQUIRED");

  const storage = providerStorageReference(resolvedSource);
  if (storage) {
    return downloadStorageReference({
      organization_id,
      reference: storage,
    });
  }

  if (!/^https:\/\//i.test(resolvedSource)) {
    throw new Error("CREATIVE_PROVIDER_INPUT_SOURCE_UNSUPPORTED");
  }

  const response = await fetch(resolvedSource, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "Avantiqo Creative Runtime/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(
      `CREATIVE_PROVIDER_HTTP_DOWNLOAD_FAILED:${response.status}`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("CREATIVE_PROVIDER_HTTP_FILE_EMPTY");

  const pathname = (() => {
    try {
      return new URL(resolvedSource).pathname;
    } catch {
      return "";
    }
  })();

  return {
    bytes,
    content_type:
      text(response.headers.get("content-type")).split(";")[0] ||
      contentTypeFromPath(pathname),
    filename: pathname.split("/").pop() || "creative-provider-input",
    source_mode: "HTTPS",
    bucket: null,
    path: pathname || null,
  };
}

export async function resolveCreativeProviderAssetUrl({
  organization_id,
  value,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");

  const direct = directUrl(value);
  if (/^https?:\/\//i.test(direct)) return direct;
  if (direct.startsWith(STORAGE_PREFIX)) {
    return signStorageReference({ organization_id, reference: direct });
  }

  const id = assetId(value);
  if (!id) return null;
  const asset = await CreativeAssetsRuntime.get(id);
  if (!asset || String(asset.organization_id) !== String(organization_id)) {
    throw new Error("CREATIVE_PROVIDER_INPUT_ASSET_NOT_FOUND");
  }
  if (asset.archived === true || asset.disabled === true || asset.deleted_at) {
    throw new Error("CREATIVE_PROVIDER_INPUT_ASSET_UNAVAILABLE");
  }

  const assetUrl = directUrl(asset) || assetStorageReference(asset);
  if (!assetUrl) throw new Error("CREATIVE_PROVIDER_INPUT_ASSET_URL_REQUIRED");
  if (/^https?:\/\//i.test(assetUrl)) return assetUrl;
  if (assetUrl.startsWith(STORAGE_PREFIX)) {
    return signStorageReference({ organization_id, reference: assetUrl });
  }
  throw new Error("CREATIVE_PROVIDER_INPUT_ASSET_URL_UNSUPPORTED");
}

export async function resolveFirstCreativeProviderAssetUrl({
  organization_id,
  values = [],
} = {}) {
  const candidates = Array.isArray(values) ? values.flat(Infinity) : [values];
  for (const value of candidates) {
    if (value === undefined || value === null || value === "") continue;
    const resolved = await resolveCreativeProviderAssetUrl({
      organization_id,
      value,
    });
    if (resolved) return resolved;
  }
  return null;
}
