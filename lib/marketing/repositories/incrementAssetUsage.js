import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();

export async function incrementAssetUsage({
  assetId,
}) {
  const { data: asset } =
    await supabaseAdmin
      .from("creative_assets")
      .select("usage_count")
      .eq("id", assetId)
      .single();

  await supabaseAdmin
    .from("creative_assets")
    .update({
      usage_count:
        Number(asset?.usage_count || 0) + 1,

      updated_at:
        new Date().toISOString(),
    })
    .eq("id", assetId);
}
