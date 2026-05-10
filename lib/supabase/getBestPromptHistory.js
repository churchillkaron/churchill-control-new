import { supabase }
from "@/lib/supabase";

export async function getBestPromptHistory({

  tenantId,

  limit = 5,

}) {

  const {
    data,
    error,
  } = await supabase
    .from(
      "marketing_prompt_history"
    )
    .select("*")
    .eq(
      "tenant_id",
      tenantId
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    )
    .limit(limit);

  if (error) {

    console.error(
      "GET PROMPT HISTORY ERROR:",
      error
    );

    throw error;

  }

  return data || [];

}