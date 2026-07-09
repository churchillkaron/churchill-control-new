export const dynamic = "force-dynamic";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";


const MAX_RETRIES = 3;


function resolveCapability(engine) {

  switch (engine) {

    case "video":
      return "ai.video.generate";

    case "enhance":
      return "ai.image.upscale";

    case "composite":
      return "ai.image.generate";

    case "full-ai":
    default:
      return "ai.image.generate";

  }

}


export async function POST(
  request
) {

  const supabase =
    createServerSupabase();


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
    } =
      await supabase
        .from("generation_jobs")
        .select("*")
        .eq("id", jobId)
        .single();


    if (error || !job) {

      return Response.json({

        success:false,

        error:"Job not found",

      });

    }


    await supabase
      .from("generation_jobs")
      .update({

        status:"processing",

        started_at:
          new Date()
            .toISOString(),

      })
      .eq(
        "id",
        jobId
      );


    const capability =
      resolveCapability(
        job.engine
      );


    const engineResult =
      await ServiceExecutionRuntime.execute({

        organization_id:
          job.organization_id ||
          job.organization_id,


        service_id:
          capability,


        input:{

          prompt:
            job.prompt,

          assets:
            job.input,

          campaign_id:
            job.campaign_id,

        },


        metadata:{

          generation_job_id:
            jobId,

          engine:
            job.engine,

        },

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
      .eq(
        "id",
        jobId
      );


    return Response.json({

      success:true,

      engineResult,

    });


  } catch(err) {


    console.error(
      "PROCESS GENERATION JOB ERROR:",
      err
    );


    if (body?.jobId) {


      const {
        data: currentJob,
      } =
        await supabase
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


      await supabase
        .from("generation_jobs")
        .update({

          status:
            nextRetry >= MAX_RETRIES
              ? "permanently_failed"
              : "retrying",


          retry_count:
            nextRetry,


          error_text:
            err.message,


          failed_at:
            nextRetry >= MAX_RETRIES
              ? new Date()
                  .toISOString()
              : null,

        })
        .eq(
          "id",
          body.jobId
        );

    }


    return Response.json({

      success:false,

      error:
        err.message,

    });

  }

}
