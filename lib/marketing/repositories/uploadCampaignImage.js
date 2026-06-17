import { getServiceSupabase }
from "@/lib/shared/supabase/service";

const supabaseAdmin =
  getServiceSupabase();

export async function uploadCampaignImage({
  file,
  tenantId,
}) {

  const path = `
    ${tenantId}/
    ${Date.now()}.png
  `.replace(/\s/g, "");

  const { error } =
    await supabaseAdmin
      .storage
      .from(
        "marketing-assets"
      )
      .upload(path, file, {
        contentType:
          "image/png",
        upsert: true,
      });

  if (error) {

    throw error;
  }

  const { data } =
    supabaseAdmin
      .storage
      .from(
        "marketing-assets"
      )
      .getPublicUrl(path);

  return data.publicUrl;
}