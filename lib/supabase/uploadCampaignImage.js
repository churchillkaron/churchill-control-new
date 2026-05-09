import { supabase }
from "@/lib/supabase";

export async function uploadCampaignImage({
  file,
  tenantId,
}) {

  const path = `
    ${tenantId}/
    ${Date.now()}.png
  `.replace(/\s/g, "");

  const { error } =
    await supabase
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
    supabase
      .storage
      .from(
        "marketing-assets"
      )
      .getPublicUrl(path);

  return data.publicUrl;
}