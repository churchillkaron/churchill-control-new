import { supabase }
from "@/lib/shared/supabase/client";

export async function getGenerationJobs({

  tenantId,

}) {

  try {

    const {
      data,
      error,
    } = await supabase

      .from(
        "generation_jobs"
      )

      .select(`

        id,
        status,
        engine,
        provider,
        created_at,
        updated_at

      `)

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

      .limit(25);

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