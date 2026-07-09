import { getServiceSupabase }
from "@/lib/shared/supabase/service";

const supabase =
  getServiceSupabase();

export async function getGenerationJobs({

  organizationId,

}) {

  try {

    const {
      data,
      error,
    } = await supabase
      .from(
        "generation_jobs"
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
      );

    if (error) {

      throw error;

    }

    return data || [];

  } catch (err) {

    console.error(
      "GET GENERATION JOBS ERROR:",
      err
    );

    return [];

  }

}
