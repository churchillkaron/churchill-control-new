import { createServerSupabase } from "@/lib/shared/supabase/server";

/**
 * Create a generation job for a marketing campaign
 * Server-safe, multi-tenant, compatible with Churchill callers
 */
export async function createGenerationJob(job) {
  const supabase = createServerSupabase();

  const {
    tenantId,
    campaignId,
    engine,
    provider,
    prompt,
    input,
    imageUrl,
    selectedAssets,
    metadata
  } = job;

  // Do not insert Facebook Page ID into UUID column
  const pageId = null;

  const { data, error } = await supabase
    .from("generation_jobs")
    .insert({
      tenant_id: tenantId,
      campaign_id: campaignId,
      engine: engine || null,
      provider: provider || null,
      prompt: prompt || null,
      input: input || {},
      page_id: pageId,
      image_url: imageUrl || null,
      selected_assets: selectedAssets || [],
      metadata: metadata || {},
      status: "queued",
      created_at: new Date().toISOString()
    })
    .select();

  if (error) {
    console.error("CREATE GENERATION JOB ERROR", error);
    throw error;
  }

  return data?.[0] || null;
}
