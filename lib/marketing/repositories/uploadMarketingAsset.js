import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();

export async function uploadMarketingAsset({
  file,
  organizationId,
  assetType,
}) {
  try {
    if (!file) {
      throw new Error("Missing file");
    }

    if (!organizationId) {
      throw new Error("organizationId required");
    }

    const fileExt =
      file.name.split(".").pop();

    const fileName =
      `${organizationId}/${Date.now()}-${Math.random()}.${fileExt}`;

    const { error: uploadError } =
      await supabaseAdmin.storage
        .from("marketing-assets")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicData } =
      supabaseAdmin.storage
        .from("marketing-assets")
        .getPublicUrl(fileName);

    const publicUrl =
      publicData.publicUrl;

    const { data, error } =
      await supabaseAdmin
        .from("creative_assets")
        .insert({
          organization_id: organizationId,
          asset_type: assetType,
          file_url: publicUrl,
          image_url: publicUrl,
          thumbnail_url: publicUrl,
          file_name: file.name,
        })
        .select()
        .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (err) {
    console.error("UPLOAD MARKETING ASSET ERROR:", err);
    throw err;
  }
}
