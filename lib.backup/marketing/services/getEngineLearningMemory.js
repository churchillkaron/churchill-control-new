import { supabase }
from "@/lib/shared/supabase/client";

export async function getEngineLearningMemory({
  tenantId,
  pageId,
}) {

  let query =
    supabase

      .from(
        "engine_learning_memory"
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