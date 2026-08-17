import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getMarketingCampaigns({
  organizationId,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data: campaigns, error: campaignsError } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (campaignsError) {
    throw campaignsError;
  }

  const rows = campaigns || [];
  const campaignIds = rows.map((campaign) => campaign.id).filter(Boolean);

  if (!campaignIds.length) {
    return { campaigns: [] };
  }

  const { data: assets, error: assetsError } = await supabaseAdmin
    .from("creative_assets")
    .select(
      "id, organization_id, campaign_id, asset_type, source_type, name, file_url, image_url, thumbnail_url, file_name, analysis, metadata, tags, score, status, created_at, storage_path, mime_type, approval_state"
    )
    .eq("organization_id", organizationId)
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: false });

  if (assetsError) {
    throw assetsError;
  }

  const assetsByCampaign = new Map();

  for (const asset of assets || []) {
    if (!asset.campaign_id) continue;

    if (!assetsByCampaign.has(asset.campaign_id)) {
      assetsByCampaign.set(asset.campaign_id, []);
    }

    assetsByCampaign.get(asset.campaign_id).push(asset);
  }

  return {
    campaigns: rows.map((campaign) => ({
      ...campaign,
      assets: assetsByCampaign.get(campaign.id) || [],
    })),
  };
}
