import { supabase }
from "@/lib/supabase";

const MAX_RETRIES = 3;

export async function GET() {

  try {

    const {
      data: jobs,
      error,
    } = await supabase

      .from(
        "generation_jobs"
      )

      .select("*")

      .eq(
        "status",
        "retrying"
      )

      .lt(
        "retry_count",
        MAX_RETRIES
      )

      .order(
        "updated_at",
        {
          ascending: true,
        }
      )

      .limit(10);

    if (error) {

      throw error;

    }

    let retried = 0;

    for (const job of jobs || []) {

      try {

        await fetch(

          `${process.env.NEXT_PUBLIC_SITE_URL}/api/marketing/process-generation-job`,

          {

            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              jobId:
                job.id,

            }),

          }

        );

        retried++;

      } catch (retryError) {

        console.error(
          "RETRY JOB ERROR:",
          retryError
        );

      }

    }

    return Response.json({

      success: true,

      retried,

    });

  } catch (err) {

    console.error(
      "RETRY GENERATION JOBS ERROR:",
      err
    );

    return Response.json({

      success: false,

      error:
        err.message,

    });

  }

}