import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import processJob from "@/lib/queue/processJob";

export default async function runWorker() {
  const { data: jobs, error } = await supabaseAdmin
    .from("queue_jobs")
    .select("*")
    .eq("status", "pending")
    .limit(10);

  if (error) {
    throw error;
  }

  const results = [];

  for (const job of jobs) {
    const result = await processJob(job);

    results.push({
      job_id: job.id,
      ...result,
    });
  }

  return {
    success: true,
    processed: results.length,
    results,
  };
}
