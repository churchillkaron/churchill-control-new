import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const BUCKET = "creative-assets";

function assetPath({
  organization_id,
  creative_project_id,
  asset_id,
  filename,
}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!asset_id) throw new Error("asset_id required");
  if (!filename) throw new Error("filename required");

  return [
    organization_id,
    creative_project_id,
    asset_id,
    filename,
  ].join("/");
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

  const storagePath = assetPath({
    organization_id,
    creative_project_id,
    asset_id,
    filename,
  });

  const { error } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      upsert: true,
      contentType: content_type,
    });

  if (error) throw error;

  const { data } = supabaseAdmin
    .storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return {
    storage_path: storagePath,
    public_url: data.publicUrl,
  };
}

export const CreativeStorageRuntime = {
  uploadBuffer,

  async uploadFromUrl({
    organization_id,
    creative_project_id,
    asset_id,
    url,
    filename,
  }) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Unable to download provider asset.");
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
