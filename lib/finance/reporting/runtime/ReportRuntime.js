import generateTrialBalance from "../reports/generateTrialBalance";
import { generateProfitAndLoss } from "../reports/generateProfitAndLoss";
import { generateBalanceSheet } from "../reports/core/generateBalanceSheet";

export async function run(reportName, params) {

  switch (reportName) {

    case "trial_balance":
      return await generateTrialBalance(params);

    case "profit_loss":
      return await generateProfitAndLoss(params);

    case "balance_sheet":
      return await generateBalanceSheet(params);

    default:
      throw new Error("Unknown report: " + reportName);
  }
}
