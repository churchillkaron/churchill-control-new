import { supabase } from "@/lib/supabase";

import { runSubledgerReconciliation } from "./runSubledgerReconciliation";
import { runLiquidityAnalysis } from "./runLiquidityAnalysis";
import { runComplianceValidation } from "./runComplianceValidation";

export async function executeAccountingWorkflow({
  tenantId,
  workflowType,
}) {
  let result = null;

  if (
    workflowType ===
    "month_end_close"
  ) {
    const ap =
      await runSubledgerReconciliation({
        tenantId,
        controlType: "AP",
      });

    const ar =
      await runSubledgerReconciliation({
        tenantId,
        controlType: "AR",
      });

    const inventory =
      await runSubledgerReconciliation({
        tenantId,
        controlType: "INVENTORY",
      });

    result = {
      ap,
      ar,
      inventory,
    };
  }

  if (
    workflowType ===
    "liquidity_analysis"
  ) {
    result =
      await runLiquidityAnalysis({
        tenantId,
      });
  }

  if (
    workflowType ===
    "compliance_validation"
  ) {
    result =
      await runComplianceValidation({
        tenantId,
      });
  }

  if (!result) {
    throw new Error(
      "Unsupported workflow type"
    );
  }

  const { data, error } =
    await supabase
      .from(
        "accounting_workflow_runs"
      )
      .insert({
        tenant_id: tenantId,
        workflow_name:
          workflowType,
        workflow_type:
          workflowType,
        status: "completed",
        completed_at:
          new Date().toISOString(),
        result,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
