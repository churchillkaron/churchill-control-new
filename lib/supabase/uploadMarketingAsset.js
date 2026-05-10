import { supabase }
from "@/lib/supabase";

export async function uploadMarketingAsset({

  file,

  tenantId,

  assetType,

}) {

  try {

    if (!file) {

      throw new Error(
        "Missing file"
      );

    }

    const fileExt =
      file.name
        .split(".")
        .pop();

    const fileName = `
${tenantId}/
${Date.now()}-
${Math.random()}
.${fileExt}
`;

    // UPLOAD TO STORAGE

    const {
      error: uploadError,
    } = await supabase
      .storage
      .from(
        "marketing-assets"
      )
      .upload(
        fileName,
        file,
        {
          cacheControl: "3600",
          upsert: false,
        }
      );

    if (uploadError) {

      throw uploadError;

    }

    // GET PUBLIC URL

    const {
      data: publicData,
    } = supabase
      .storage
      .from(
        "marketing-assets"
      )
      .getPublicUrl(
        fileName
      );

    const publicUrl =
      publicData.publicUrl;

    // SAVE DATABASE RECORD

    const {
      data,
      error,
    } = await supabase
      .from(
        "marketing_assets"
      )
      .insert({

        tenant_id:
          tenantId,

        asset_type:
          assetType,

        file_url:
          publicUrl,

        file_name:
          file.name,

      })
      .select()
      .single();

    if (error) {

      throw error;

    }

    return data;

  } catch (err) {

    console.error(
      "UPLOAD MARKETING ASSET ERROR:",
      err
    );

    throw err;

  }

}