import generateTrialBalance from "../reports/generateTrialBalance";
import { generateProfitAndLoss } from "../reports/generateProfitAndLoss";
import { generateBalanceSheet } from "../reports/core/generateBalanceSheet";
import { generateCashflow } from "../reports/generateCashflow";
import { mapProfitLossReport } from "../mappers/reportDocumentMapper";
import { mapCashflowReport } from "../mappers/cashflowDocumentMapper";
import { mapBalanceSheetReport } from "../mappers/balanceSheetDocumentMapper";
import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";

export async function run(reportName, params = {}) {
  const normalizedParams = {
    ...params,
    organizationId:
      params.organizationId ||
      params.organization_id ||
      null,
    entityId:
      params.entityId ||
      params.entity_id ||
      null,
    periodId:
      params.periodId ||
      params.period_id ||
      null,
    startDate:
      params.startDate ||
      params.date_from ||
      null,
    endDate:
      params.endDate ||
      params.date_to ||
      null,
  };

  const businessContext = await resolveBusinessContext({
    organizationId: normalizedParams.organizationId,
    entityId: normalizedParams.entityId,
    periodId: normalizedParams.periodId,
  });

  if (!businessContext.success) {
    const error = new Error(
      businessContext.error ||
      "Business context could not be resolved"
    );
    error.status = businessContext.status || 400;
    throw error;
  }

  const reportParams = {
    ...normalizedParams,
    organizationId: businessContext.organizationId,
    organization_id: businessContext.organizationId,
    entityId: businessContext.entityId,
    entity_id: businessContext.entityId,
    periodId: businessContext.periodId,
    period_id: businessContext.periodId,
    startDate:
      normalizedParams.startDate ||
      businessContext.period?.start_date ||
      null,
    endDate:
      normalizedParams.endDate ||
      businessContext.period?.end_date ||
      null,
  };

  let result;

  switch (reportName) {
    case "trial_balance":
      result = await generateTrialBalance(reportParams);
      break;

    case "profit_loss":
      result = await generateProfitAndLoss(reportParams);
      result = {
        success: true,
        reportType: "profit_loss",
        document: mapProfitLossReport({
          result,
          organization: businessContext.organization,
          entity: businessContext.entity,
          period: businessContext.period,
          currency: {
            code: businessContext.currency,
          },
        }),
      };
      break;

    case "balance_sheet":
      result = await generateBalanceSheet(reportParams);
      result = {
        success: true,
        reportType: "balance_sheet",
        document: mapBalanceSheetReport({
          result,
          organization: businessContext.organization,
          entity: businessContext.entity,
          period: businessContext.period,
          currency: {
            code: businessContext.currency,
          },
        }),
      };
      break;

    case "cash_flow":
      result = await generateCashflow(reportParams);
      result = {
        success: true,
        reportType: "cash_flow",
        document: mapCashflowReport({
          result,
          organization: businessContext.organization,
          entity: businessContext.entity,
          period: businessContext.period,
          currency: {
            code: businessContext.currency,
          },
        }),
      };
      break;

    default:
      throw new Error("Unknown report: " + reportName);
  }

  if (result?.document) {
    return result;
  }

  return {
    success: true,
    reportType: reportName,
    data: result,
  };
}
