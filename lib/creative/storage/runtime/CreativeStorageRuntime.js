import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const BUCKET = "creative-assets";
const DEFAULT_SIGNED_URL_SECONDS = 3600;

function safeFilename(value = "asset.bin") {
  return String(value || "asset.bin")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "asset.bin";
}

function assetDirectory({
  organization_id,
  creative_project_id,
  asset_id,
}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!asset_id) throw new Error("asset_id required");

  return [
    organization_id,
    creative_project_id,
    asset_id,
  ].join("/");
}

function assetPath({
  organization_id,
  creative_project_id,
  asset_id,
  filename,
  checksum = null,
}) {
  if (!filename) throw new Error("filename required");

  const immutableName = checksum
    ? `${checksum.slice(0, 20)}-${safeFilename(filename)}`
    : safeFilename(filename);

  return [
    assetDirectory({
      organization_id,
      creative_project_id,
      asset_id,
    }),
    immutableName,
  ].join("/");
}

function decodeDataUrl(value) {
  const match = String(value || "").match(
    /^data:([^;,]+)?(;base64)?,([\s\S]*)$/,
  );

  if (!match) return null;

  const contentType = match[1] || "application/octet-stream";
  const encoded = match[3] || "";
  const buffer = match[2]
    ? Buffer.from(encoded, "base64")
    : Buffer.from(decodeURIComponent(encoded), "utf8");

  return {
    buffer,
    content_type: contentType,
  };
}

function objectTimestamp(item = {}) {
  const value =
    item.updated_at ||
    item.created_at ||
    item.last_accessed_at ||
    null;
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function objectContentType(item = {}) {
  return (
    item.metadata?.mimetype ||
    item.metadata?.contentType ||
    item.metadata?.content_type ||
    null
  );
}

function objectByteSize(item = {}) {
  const value = Number(
    item.metadata?.size ||
    item.metadata?.contentLength ||
    item.metadata?.content_length ||
    0,
  );

  return Number.isFinite(value) ? value : 0;
}

async function createSignedUrl(
  storagePath,
  expiresIn = DEFAULT_SIGNED_URL_SECONDS,
) {
  if (!storagePath) throw new Error("storage_path required");

  const normalizedExpiry = Math.max(
    60,
    Math.min(
      Number(expiresIn || DEFAULT_SIGNED_URL_SECONDS),
      86400,
    ),
  );

  const { data, error } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .createSignedUrl(storagePath, normalizedExpiry);

  if (error) throw error;

  return {
    signed_url: data.signedUrl,
    expires_in: normalizedExpiry,
  };
}

async function uploadBuffer({
  organization_id,
  creative_project_id,
  asset_id,
  filename,
  buffer,
  content_type = "application/octet-stream",
}) {
  if (!buffer) throw new Error("buffer required");

  const normalizedBuffer = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(buffer);
  const checksum = createHash("sha256")
    .update(normalizedBuffer)
    .digest("hex");
  const storagePath = assetPath({
    organization_id,
    creative_project_id,
    asset_id,
    filename,
    checksum,
  });

  const { error } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .upload(storagePath, normalizedBuffer, {
      upsert: false,
      contentType: content_type,
      cacheControl: "31536000",
    });

  if (
    error &&
    !String(error.message || "")
      .toLowerCase()
      .includes("already exists")
  ) {
    throw error;
  }

  const delivery = await createSignedUrl(storagePath);

  return {
    storage_path: storagePath,
    signed_url: delivery.signed_url,
    public_url: delivery.signed_url,
    delivery_mode: "PRIVATE_SIGNED_URL",
    expires_in: delivery.expires_in,
    checksum,
    byte_size: normalizedBuffer.length,
    content_type,
  };
}

async function findStoredAsset({
  organization_id,
  creative_project_id,
  asset_id,
  expires_in = DEFAULT_SIGNED_URL_SECONDS,
} = {}) {
  const prefix = assetDirectory({
    organization_id,
    creative_project_id,
    asset_id,
  });

  const { data, error } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .list(prefix, {
      limit: 100,
    });

  if (error) throw error;

  const files = (data || [])
    .filter((item) => item?.name && item?.id)
    .sort((left, right) => (
      objectTimestamp(right) - objectTimestamp(left) ||
      String(right.name).localeCompare(String(left.name))
    ));

  const file = files[0] || null;
  if (!file) return null;

  const storagePath = `${prefix}/${file.name}`;
  const delivery = await createSignedUrl(
    storagePath,
    expires_in,
  );

  return {
    storage_path: storagePath,
    signed_url: delivery.signed_url,
    public_url: delivery.signed_url,
    delivery_mode: "PRIVATE_SIGNED_URL_RECOVERY",
    expires_in: delivery.expires_in,
    checksum: null,
    byte_size: objectByteSize(file),
    content_type: objectContentType(file),
    created_at: file.created_at || null,
    updated_at: file.updated_at || null,
  };
}

export const CreativeStorageRuntime = {
  uploadBuffer,

  createSignedUrl,

  findStoredAsset,

  async resolveDeliveryUrl({
    storage_path,
    expires_in = DEFAULT_SIGNED_URL_SECONDS,
  } = {}) {
    return createSignedUrl(storage_path, expires_in);
  },

  async uploadDataUrl({
    organization_id,
    creative_project_id,
    asset_id,
    data_url,
    filename = "generated-asset.bin",
  }) {
    const decoded = decodeDataUrl(data_url);
    if (!decoded) throw new Error("valid data_url required");

    return uploadBuffer({
      organization_id,
      creative_project_id,
      asset_id,
      filename,
      buffer: decoded.buffer,
      content_type: decoded.content_type,
    });
  },

  async uploadFromUrl({
    organization_id,
    creative_project_id,
    asset_id,
    url,
    filename,
  }) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error("provider asset must use https");
    }

    const response = await fetch(parsed, {
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      throw new Error(
        `Unable to download provider asset: ${response.status}`,
      );
    }

    return uploadBuffer({
      organization_id,
      creative_project_id,
      asset_id,
      filename,
      buffer: Buffer.from(await response.arrayBuffer()),
      content_type:
        response.headers.get("content-type") ||
        "application/octet-stream",
    });
  },
};
