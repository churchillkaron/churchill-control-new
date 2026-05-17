import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createSystemOverview() {

  try {

    const [
      jobs,
      alerts,
      audits,
    ] = await Promise.all([

      supabaseAdmin
        .from("queue_jobs")
        .select("*", {
          count: "exact",
          head: true,
        }),

      supabaseAdmin
        .from("audit_logs")
        .select("*", {
          count: "exact",
          head: true,
        }),

      supabaseAdmin
        .from("dead_letter_jobs")
        .select("*", {
          count: "exact",
          head: true,
        }),
    ]);

    return {
      success: true,

      queue_jobs:
        jobs.count || 0,

      audit_logs:
        alerts.count || 0,

      dead_letter_jobs:
        audits.count || 0,

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
