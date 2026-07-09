import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();

export async function savePublishLog(campaign, account, result = {}) {
  const organizationId =
    campaign.organization_id ||
    campaign.organizationId;

  if (!organizationId) {
    throw new Error("organization_id required");
  }

  const pageId =
    account?.page_id ||
    campaign.selected_assets?.[0]?.page_id ||
    campaign.pageId ||
    null;

  const { data, error } =
    await supabaseAdmin
      .from("campaign_publish_logs")
      .insert({
        organization_id: organizationId,
        campaign_id: campaign.id,
        page_id: pageId,
        platform: result.platform || "meta",
        post_id: result.postId || null,
        post_url: result.postUrl || null,
        engagement_likes: result.likes || 0,
        engagement_comments: result.comments || 0,
        engagement_shares: result.shares || 0,
        engagement_saves: result.saves || 0,
        engagement_reach: result.reach || 0,
        created_at: new Date().toISOString(),
      })
      .select();

  if (error) {
    console.error("SAVE PUBLISH LOG ERROR", error);
    throw error;
  }

  return data?.[0] || null;
}
