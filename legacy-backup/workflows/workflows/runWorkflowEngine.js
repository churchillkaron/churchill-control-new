import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import runCorrectiveAction from "@/lib/intelligence/actions/runCorrectiveAction";

export default async function runWorkflowEngine({
  tenant_id,
  event_type,
}) {

  try {

    const {
      data: workflows,
      error,
    } = await supabaseAdmin
      .from("workflow_registry")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      )
      .eq(
        "trigger_event",
        event_type
      )
      .eq(
        "active",
        true
      );

    if (error) {
      throw error;
    }

    const executed = [];

    for (const workflow of workflows || []) {

      if (
        workflow.action ===
        "RUN_CORRECTIVE_ACTION"
      ) {

        const result =
          await runCorrectiveAction({
            tenant_id,
            issue:
              "LOW_PERFORMANCE",
            severity:
              "warning",
          });

        executed.push({
          workflow:
            workflow.name,
          result,
        });
      }
    }

    return {
      success: true,
      executed,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
