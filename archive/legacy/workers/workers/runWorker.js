import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import processJob from "@/lib/queue/processJob";

const WORKER_NAME =
  `worker-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

export default async function runWorker() {

  const {
    data: jobs,
    error,
  } = await supabaseAdmin
    .from("queue_jobs")
    .select("*")
    .eq(
      "status",
      "pending"
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    )
    .limit(10);

  if (error) {
    throw error;
  }

  const claimedJobs = [];

  for (const job of jobs || []) {

    const {
      data: claimedJob,
    } = await supabaseAdmin
      .from("queue_jobs")
      .update({

        status:
          "claimed",

        worker_name:
          WORKER_NAME,

        locked_at:
          new Date().toISOString(),

      })
      .eq(
        "id",
        job.id
      )
      .eq(
        "status",
        "pending"
      )
      .select()
      .single();

    if (claimedJob) {

      claimedJobs.push(
        claimedJob
      );

    }

  }

  const results = [];

  for (const job of claimedJobs) {

    const result =
      await processJob(job);

    results.push({

      job_id:
        job.id,

      ...result,

    });

  }

  return {

    success: true,

    worker:
      WORKER_NAME,

    claimed:
      claimedJobs.length,

    processed:
      results.length,

    results,

  };

}
