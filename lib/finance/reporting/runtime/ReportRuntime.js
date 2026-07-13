import generateTrialBalance from "../reports/generateTrialBalance";
import { generateProfitAndLoss } from "../reports/generateProfitAndLoss";
import { generateBalanceSheet } from "../reports/core/generateBalanceSheet";
import { generateCashflow } from "../reports/generateCashflow";

import {
  mapProfitLossReport,
} from "../mappers/reportDocumentMapper";

import {
  resolveBusinessContext,
} from "@/lib/business-context/resolveBusinessContext";

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

  };


  const businessContext =
    await resolveBusinessContext({

      organizationId:
        normalizedParams.organizationId,

      entityId:
        normalizedParams.entityId,

      periodId:
        normalizedParams.periodId,

    });


  let result;


  switch (reportName) {

    case "trial_balance":
      result = await generateTrialBalance(normalizedParams);
      break;


    case "profit_loss":

      result =
        await generateProfitAndLoss(
          normalizedParams
        );


      result = {

        success:true,

        reportType:
          "profit_loss",

        document:
          mapProfitLossReport({

            result,

            organization:
              businessContext.organization,

            entity:
              businessContext.entity,

            period:
              businessContext.period,

            currency:
              {
                code:
                  businessContext.currency
              },

          }),

      };


      break;


    case "balance_sheet":
      result = await generateBalanceSheet(normalizedParams);
      break;


    case "cash_flow":
      result = await generateCashflow(normalizedParams);
      break;


    default:
      throw new Error("Unknown report: " + reportName);

  }


  if (
    result?.document
  ) {

    return result;

  }


  return {

    success:true,

    reportType:
      reportName,

    data:
      result,

  };

}
