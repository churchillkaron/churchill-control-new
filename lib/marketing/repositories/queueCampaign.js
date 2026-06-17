import { createClient } from "@supabase/supabase-js";

export async function queueCampaign(job) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const {
    campaignId,
    tenantId,
    pageId,
    platform,
    scheduledFor,
  } = job;

  const { data, error } = await supabase
    .from("campaign_publish_queue")
    .insert({
      campaign_id: campaignId,
      tenant_id: tenantId,
      page_id: null,
      platform: platform || "meta",
      status: "queued",
      retry_count: 0,
      last_error: null,
      scheduled_for:
        scheduledFor ||
        new Date().toISOString(),
      created_at:
        new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error(
      "QUEUE CAMPAIGN ERROR",
      error
    );
    throw error;
  }

  return data;
}
