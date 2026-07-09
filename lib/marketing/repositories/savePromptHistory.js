import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();

export async function savePromptHistory({
  organizationId,
  prompt,
  recommendation,
  selectedAssets = [],
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data, error } =
    await supabaseAdmin
      .from("marketing_prompt_history")
      .insert({
        organization_id: organizationId,
        prompt,
        recommendation,
        selected_assets: selectedAssets,
      })
      .select()
      .single();

  if (error) {
    console.error("SAVE PROMPT HISTORY ERROR:", error);
    throw error;
  }

  return data;
}
