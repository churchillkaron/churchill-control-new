import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function runAutoscaling() {

  try {

    const {
      count,
    } = await supabaseAdmin
      .from("distributed_jobs")
      .select(
        "*",
        {
          count:
            "exact",
          head: true,
        }
      )
      .eq(
        "status",
        "PENDING"
      );

    let recommendedWorkers = 1;

    if (
      count > 50
    ) {

      recommendedWorkers = 10;

    } else if (
      count > 20
    ) {

      recommendedWorkers = 5;
    }

    return {

      success: true,

      pending_jobs:
        count || 0,

      recommended_workers:
        recommendedWorkers,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
