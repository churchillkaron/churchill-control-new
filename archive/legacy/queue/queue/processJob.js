import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  getJobHandler,
} from "@/lib/queue/handlers/jobHandlerRegistry";

import moveToDeadLetter from "@/lib/queue/retries/moveToDeadLetter";

export default async function processJob(
  job
) {

  const handler =
    getJobHandler(
      job.type
    );

  if (!handler) {

    await supabaseAdmin
      .from("queue_jobs")
      .update({

        status:
          "failed",

        error_message:
          `No handler registered for ${job.type}`,

      })
      .eq(
        "id",
        job.id
      );

    return {

      success: false,

      error:
        "NO_HANDLER_REGISTERED",

    };

  }

  try {

    await supabaseAdmin
      .from("queue_jobs")
      .update({

        status:
          "processing",

        started_at:
          new Date().toISOString(),

      })
      .eq(
        "id",
        job.id
      );

    console.log(
      "[PROCESSING_JOB]",
      job.type
    );

    const result =
      await handler(
        job.payload || {}
      );

    await supabaseAdmin
      .from("queue_jobs")
      .update({

        status:
          "completed",

        completed_at:
          new Date().toISOString(),

      })
      .eq(
        "id",
        job.id
      );

    return {

      success: true,

      result,

    };

  } catch (error) {

    console.error(
      "[JOB_PROCESSING_ERROR]",
      error
    );

    const nextRetryCount =
      Number(
        job.retry_count || 0
      ) + 1;

    const maxRetries =
      Number(
        job.max_retries || 3
      );

    const shouldDeadLetter =
      nextRetryCount >=
      maxRetries;

    await supabaseAdmin
      .from("queue_jobs")
      .update({

        status:
          shouldDeadLetter
            ? "dead_letter"
            : "failed",

        error_message:
          error.message,

        retry_count:
          nextRetryCount,

        dead_letter:
          shouldDeadLetter,

      })
      .eq(
        "id",
        job.id
      );

    if (shouldDeadLetter) {

      await moveToDeadLetter(
        job
      );

    }

    return {

      success: false,

      error:
        error.message,

      retry_count:
        nextRetryCount,

      dead_letter:
        shouldDeadLetter,

    };

  }

}
