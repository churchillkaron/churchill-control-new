import { supabase }
from "@/lib/supabase";

export async function getGenerationJobs({

  tenantId,

}) {

  const {
    data,
    error,
  } = await supabase
    .from("generation_jobs")
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
    );

  if (error) {

    console.error(
      "GET GENERATION JOBS ERROR:",
      error
    );

    return [];

  }

  return data || [];

}