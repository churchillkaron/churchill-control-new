import { supabase }
from "@/lib/shared/supabase/client";

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

    throw error;

  }

  return data || [];

}
