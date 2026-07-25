import crypto from "crypto";

import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();

function safeSegment(value, fallback = "asset") {
  const normalized = String(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
}

function fileExtension(file = {}) {
  const name = String(file.name || "");
  const fromName = name.includes(".")
    ? name.split(".").pop()
    : "";

  if (fromName) return safeSegment(fromName.toLowerCase(), "bin");

  const mimeSubtype = String(file.type || "").split("/")[1] || "";
  return safeSegment(mimeSubtype.split("+")[0].toLowerCase(), "bin");
}

export async function uploadCampaignImage({
  file,
  organizationId,
  creativeMissionId = null,
  creativeProjectId = null,
  source = "upload",
  detailed = false,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("A valid upload file is required");
  }

  const extension = fileExtension(file);
  const originalName = safeSegment(file.name || `asset.${extension}`);
  const assetId = crypto.randomUUID();
  const hierarchy = [
    safeSegment(organizationId),
    creativeMissionId ? safeSegment(creativeMissionId) : null,
    creativeProjectId ? safeSegment(creativeProjectId) : null,
    safeSegment(source),
    assetId,
  ].filter(Boolean);
  const path = `${hierarchy.join("/")}/${originalName}`;
  const contentType = file.type || "application/octet-stream";

  const { error } = await supabaseAdmin.storage
    .from("marketing-assets")
    .upload(path, file, {
      contentType,
      upsert: false,
      cacheControl: "3600",
    });

  if (error) {
    throw error;
  }

  const { data } = supabaseAdmin.storage
    .from("marketing-assets")
    .getPublicUrl(path);

  const result = {
    asset_id: assetId,
    public_url: data.publicUrl,
    storage_path: path,
    original_file_name: file.name || originalName,
    stored_file_name: originalName,
    mime_type: contentType,
    file_size_bytes: Number(file.size || 0),
    extension,
    source,
  };

  return detailed ? result : result.public_url;
}
