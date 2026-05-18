import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function runRecoveryEngine({
  stuck_jobs = [],
}) {

  try {

    const recovered = [];

    for (const job of stuck_jobs) {

      await supabaseAdmin
        .from("distributed_jobs")
        .update({

          status:
            "PENDING",

          processed_at:
            null,
        })
        .eq(
          "id",
          job.id
        );

      recovered.push({

        job_id:
          job.id,

        recovered: true,
      });
    }

    return {

      success: true,

      recovered,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
