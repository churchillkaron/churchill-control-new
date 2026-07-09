import { getServiceSupabase }
from "@/lib/shared/supabase/service";

const supabase =
  getServiceSupabase();

export async function getEngineLearningMemory({
  organizationId,
  pageId,
}) {

  let query =
    supabase

      .from(
        "engine_learning_memory"
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

      .limit(500);

  if (pageId) {

    query =
      query.eq(
        "page_id",
        pageId
      );

  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw error;
  }

  return {

    learningMemory:
      data || [],

  };

}