import { supabase }
from "@/lib/supabase";

import engineRouter
from "@/lib/ai/engineRouter";

import { runOpenAIEngine }
from "@/lib/ai/engines/openaiEngine";

import { runFluxEnhanceEngine }
from "@/lib/ai/engines/fluxEnhanceEngine";

import { runSDXLCompositeEngine }
from "@/lib/ai/engines/sdxlCompositeEngine";

import { runVideoEngine }
from "@/lib/ai/engines/runVideoEngine";

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
  await runOpenAIEngine({

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
              job.prompt,

            assets:
              job.input,

          });

        break;

      case "composite":

        engineResult =
          await runSDXLCompositeEngine({

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

    })
    .eq(
      "id",
      job.campaign_id
    );

}
    await supabase
      .from("generation_jobs")
      .update({

        status:
          "completed",

        output:
          engineResult?.output || {},

        completed_at:
          new Date()
            .toISOString(),

      })
      .eq("id", jobId);

    return Response.json({

      success: true,

      engineResult,

    });
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
        "generated",

    })
    .eq(
      "id",
      job.campaign_id
    );

}
  } catch (err) {

    console.error(
      "PROCESS GENERATION JOB ERROR:",
      err
    );

    if (body?.jobId) {

      await supabase
        .from("generation_jobs")
        .update({

          status:
            "failed",

          error_text:
            err.message,

        })
        .eq(
          "id",
          body.jobId
        );

    }

    return Response.json({

      success: false,

      error:
        err.message,

    });

  }

}