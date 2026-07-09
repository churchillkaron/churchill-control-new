import { getServiceSupabase }
from "@/lib/shared/supabase/service";

const supabase =
  getServiceSupabase();

export async function getBestPromptHistory({

  organizationId,

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
      "organization_id",
      organizationId
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
