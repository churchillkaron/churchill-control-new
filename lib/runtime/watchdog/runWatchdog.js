import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function runWatchdog() {

  try {

    const {
      data: jobs,
      error,
    } = await supabaseAdmin
      .from("distributed_jobs")
      .select("*")
      .eq(
        "status",
        "PENDING"
      );

    if (error) {
      throw error;
    }

    const stuckJobs = [];

    for (const job of jobs || []) {

      const created =
        new Date(
          job.created_at
        ).getTime();

      const now =
        Date.now();

      const minutes =
        (
          now - created
        ) /
        1000 /
        60;

      if (
        minutes > 10
      ) {

        stuckJobs.push(
          job
        );
      }
    }

    return {

      success: true,

      stuck_jobs:
        stuckJobs,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
