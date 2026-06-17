import { createServerSupabase } from "@/lib/shared/supabase/server";

/**
 * Save a publish log for a campaign
 * Server-safe, multi-tenant
 */
export async function savePublishLog(campaign, account, result = {}) {
  const supabase = createServerSupabase();

  const pageId = account?.page_id || campaign.selected_assets?.[0]?.page_id || campaign.pageId || null;

  const { data, error } = await supabase
    .from("campaign_publish_logs")
    .insert({
      campaign_id: campaign.id,
      tenant_id: campaign.tenant_id,
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
