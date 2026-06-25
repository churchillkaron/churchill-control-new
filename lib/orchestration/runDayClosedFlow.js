import { runExecutiveKPIs } from "@/lib/intelligence/finance/runExecutiveKPIs";
import { runCashFlowEngine } from "@/lib/finance/reporting/runCashFlowEngine";
import generateTrialBalance from "@/lib/finance/reporting/generateTrialBalance";

export async function runDayClosedFlow({ tenantId }) {
  const executionSteps = [];

  // 1️⃣ Update Executive KPIs
  executionSteps.push("EXECUTIVE_KPI_UPDATED");
  await runExecutiveKPIs({ tenantId });

  // 2️⃣ Update Cash Flow
  executionSteps.push("CASH_FLOW_UPDATED");
  await runCashFlowEngine({ tenantId });

  // 3️⃣ Generate Trial Balance using canonical general_ledger
  executionSteps.push("TRIAL_BALANCE_UPDATED");
  await generateTrialBalance({ tenantId });

  return {
    success: true,
    executionSteps,
  };
}
