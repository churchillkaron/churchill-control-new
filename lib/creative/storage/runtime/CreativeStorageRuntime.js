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

function assetPath({
  organization_id,
  creative_project_id,
  asset_id,
  filename,
  checksum = null,
}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!asset_id) throw new Error("asset_id required");
  if (!filename) throw new Error("filename required");

  const immutableName = checksum
    ? `${checksum.slice(0, 20)}-${safeFilename(filename)}`
    : safeFilename(filename);

  return [
    organization_id,
    creative_project_id,
    asset_id,
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

async function createSignedUrl(storagePath, expiresIn = DEFAULT_SIGNED_URL_SECONDS) {
  if (!storagePath) throw new Error("storage_path required");

  const { data, error } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .createSignedUrl(
      storagePath,
      Math.max(60, Math.min(Number(expiresIn || DEFAULT_SIGNED_URL_SECONDS), 86400)),
    );

  if (error) throw error;

  return {
    signed_url: data.signedUrl,
    expires_in: Math.max(60, Math.min(Number(expiresIn || DEFAULT_SIGNED_URL_SECONDS), 86400)),
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

  if (error && !String(error.message || "").toLowerCase().includes("already exists")) {
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

export const CreativeStorageRuntime = {
  uploadBuffer,

  createSignedUrl,

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
      throw new Error(`Unable to download provider asset: ${response.status}`);
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
