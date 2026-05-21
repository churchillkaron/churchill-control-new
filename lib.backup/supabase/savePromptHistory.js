import { supabase }
from "@/lib/shared/supabase/client";

export async function savePromptHistory({

  tenantId,

  prompt,

  recommendation,

  selectedAssets = [],

}) {

  const {
    data,
    error,
  } = await supabase
    .from(
      "marketing_prompt_history"
    )
    .insert({

      tenant_id:
        tenantId,

      prompt,

      recommendation,

      selected_assets:
        selectedAssets,

    })
    .select()
    .single();

  if (error) {

    console.error(
      "SAVE PROMPT HISTORY ERROR:",
      error
    );

    throw error;

  }

  return data;

}