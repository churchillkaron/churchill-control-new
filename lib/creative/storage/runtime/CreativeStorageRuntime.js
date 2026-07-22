import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const BUCKET = "creative-assets";

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

  const { data } = supabaseAdmin
    .storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return {
    storage_path: storagePath,
    public_url: data.publicUrl,
    checksum,
    byte_size: normalizedBuffer.length,
    content_type,
  };
}

export const CreativeStorageRuntime = {
  uploadBuffer,

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
    const response = await fetch(url);

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
