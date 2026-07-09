import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();

export async function createGenerationJob(job) {
  const {
    organizationId,
    campaignId,
    engine,
    provider,
    prompt,
    input,
    imageUrl,
    selectedAssets,
    metadata,
    pageId = null,
  } = job;

  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data, error } =
    await supabaseAdmin
      .from("generation_jobs")
      .insert({
        organization_id: organizationId,
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
        created_at: new Date().toISOString(),
      })
      .select();

  if (error) {
    console.error("CREATE GENERATION JOB ERROR", error);
    throw error;
  }

  return data?.[0] || null;
}
