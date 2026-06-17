export const dynamic = "force-dynamic";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

const supabase =
  createServerSupabase();

import engineRouter
from "@/lib/marketing/ai/router/engineRouter";

import { runFullAIEngine }
from "@/lib/marketing/ai/engines/runFullAIEngine";

import { runFluxEnhanceEngine }
from "@/lib/marketing/ai/engines/runFluxEnhanceEngine";

import { runCompositeEngine }
from "@/lib/marketing/ai/engines/runCompositeEngine";

import { runVideoEngine }
from "@/lib/marketing/ai/engines/runVideoEngine";

const MAX_RETRIES = 3;

export async function POST(
  request
) {

  let body = null;

  try {

    body =
      await request.json();

    const {
      jobId,
    } = body;

    const {

      data: job,

      error,

    } = await supabase

      .from("generation_jobs")

      .select("*")

      .eq("id", jobId)

      .single();

    if (error || !job) {

      return Response.json({

        success: false,

        error:
          "Job not found",

      });

    }

    const engine =
      engineRouter(
        job.engine
      );

    console.log(
      "PROCESSING ENGINE:",
      engine
    );

    await supabase

      .from("generation_jobs")

      .update({

        status:
          "processing",

        started_at:
          new Date()
            .toISOString(),

      })

      .eq("id", jobId);

    let engineResult = null;

    switch (job.engine) {

      case "full-ai":

        engineResult =

         await runFullAIEngine({

            prompt:
              job.prompt,

            tenantId:
              job.tenant_id,

          });

        break;

      case "enhance":

        engineResult =

          await runFluxEnhanceEngine({

    prompt:
    campaign.prompt,

    poster:
    campaign,

   assets:
    campaign.selected_assets,

    });

        break;

      case "composite":

        engineResult =

          await runCompositeEngine({

            prompt:
              job.prompt,

            assets:
              job.input,

          });

        break;

      case "video":

        engineResult =

          await runVideoEngine({

            prompt:
              job.prompt,

            assets:
              job.input,

          });

        break;

      default:

        throw new Error(
          `Unknown engine: ${job.engine}`
        );

    }

    // UPDATE CAMPAIGN

    if (
      engineResult?.output?.image_url
    ) {

      await supabase

        .from(
          "marketing_campaigns"
        )

        .update({

          image_url:
            engineResult.output.image_url,

          status:
            "ready",

          updated_at:
            new Date()
              .toISOString(),

        })

        .eq(
          "id",
          job.campaign_id
        );

    }

    // COMPLETE JOB

    await supabase

      .from("generation_jobs")

      .update({

        status:
          "completed",

        output:
          engineResult?.output || {},

        provider:
          engineResult?.provider || "",

        model:
          engineResult?.model || "",

        completed_at:
          new Date()
            .toISOString(),

      })

      .eq("id", jobId);

    return Response.json({

      success: true,

      engineResult,

    });

  } catch (err) {

    console.error(
      "PROCESS GENERATION JOB ERROR:",
      err
    );

    // LOAD CURRENT JOB

    if (body?.jobId) {

      const {
        data: currentJob,
      } = await supabase

        .from("generation_jobs")

        .select("*")

        .eq(
          "id",
          body.jobId
        )

        .single();

      const retryCount =
        currentJob?.retry_count || 0;

      const nextRetry =
        retryCount + 1;

      // PERMANENT FAILURE

      if (
        nextRetry >=
        MAX_RETRIES
      ) {

        await supabase

          .from("generation_jobs")

          .update({

            status:
              "permanently_failed",

            retry_count:
              nextRetry,

            error_text:
              err.message,

            failed_at:
              new Date()
                .toISOString(),

          })

          .eq(
            "id",
            body.jobId
          );

      } else {

        // RETRYABLE FAILURE

        await supabase

          .from("generation_jobs")

          .update({

            status:
              "retrying",

            retry_count:
              nextRetry,

            error_text:
              err.message,

            updated_at:
              new Date()
                .toISOString(),

          })

          .eq(
            "id",
            body.jobId
          );

      }

    }

    return Response.json({

      success: false,

      error:
        err.message,

    });

  }

}