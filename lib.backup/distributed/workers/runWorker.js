import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import runAIOrchestrator from "@/lib/ai-agents/orchestrator/runAIOrchestrator";

export default async function runWorker({
  tenant_id,
}) {

  try {

    const {
      data: jobs,
      error,
    } = await supabaseAdmin
      .from("distributed_jobs")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      )
      .eq(
        "status",
        "PENDING"
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (error) {
      throw error;
    }

    const processed = [];

    for (const job of jobs || []) {

      let result = null;

      // ===== AI ORCHESTRATION =====
      if (
        job.job_type ===
        "AI_ORCHESTRATION"
      ) {

        result =
          await runAIOrchestrator({

            tenant_id,
          });
      }

      // ===== UPDATE STATUS =====
      await supabaseAdmin
        .from("distributed_jobs")
        .update({

          status:
            "COMPLETED",

          processed_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          job.id
        );

      processed.push({

        job_type:
          job.job_type,

        result,
      });
    }

    return {

      success: true,

      processed,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
