import { runExecutiveKPIs } from "@/lib/intelligence/finance/runExecutiveKPIs";
import { runCashFlowEngine } from "@/lib/finance/core/runCashFlowEngine";
import { runTrialBalance } from "@/lib/finance/core/runTrialBalance";

export async function runDayClosedFlow({
  tenantId,
}) {
  const executionSteps = [];

  executionSteps.push(
    "EXECUTIVE_KPI_UPDATED"
  );

  await runExecutiveKPIs({
    tenantId,
  });

  executionSteps.push(
    "CASH_FLOW_UPDATED"
  );

  await runCashFlowEngine({
    tenantId,
  });

  executionSteps.push(
    "TRIAL_BALANCE_UPDATED"
  );

  await runTrialBalance({
    tenantId,
  });

  return {
    success: true,
    executionSteps,
  };
}
