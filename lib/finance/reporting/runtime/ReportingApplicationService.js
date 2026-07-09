import runCashFlowEngine from "../workflows/runCashFlowEngine";
import buildRevenueForecast from "@/lib/finance/budgeting/capabilities/buildRevenueForecast";
import getFinanceSummary from "../capabilities/getFinanceSummary";
import runProfitLoss from "../workflows/runProfitLoss";
import runTrialBalance from "../workflows/runTrialBalance";

// ==============================
// CASH FLOW
// ==============================
export async function runCashFlowCommand(input) {
  return await runCashFlowEngine(input);
}

// ==============================
// FORECAST
// ==============================
export async function buildRevenueForecastCommand(input) {
  return await buildRevenueForecast(input);
}

// ==============================
// SUMMARY
// ==============================
export async function getFinanceSummaryCommand(input) {
  return await getFinanceSummary(input);
}

// ==============================
// REPORTS (LEGACY COMPAT)
// ==============================
export async function run(input) {
  const { type, ...params } = input;

  switch (type) {
    case "profit_loss":
      return await runProfitLoss(params);

    case "trial_balance":
      return await runTrialBalance(params);

    default:
      throw new Error("Unknown report type: " + type);
  }
}
