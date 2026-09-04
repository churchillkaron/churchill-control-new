import buildCashFlowProjection from "@/lib/finance/treasury/buildCashFlowProjection";
import buildRevenueForecast from "@/lib/finance/budgeting/capabilities/buildRevenueForecast";
import buildProfitAndLossForecast from "@/lib/finance/budgeting/capabilities/buildProfitAndLossForecast";
import buildForecastScenarios from "@/lib/finance/budgeting/capabilities/buildForecastScenarios";
import getFinanceSummary from "../capabilities/getFinanceSummary";

import {
  run as runReportRuntime,
} from "./ReportRuntime";

export async function runCashFlowCommand(input) {
  return await buildCashFlowProjection(input);
}

export async function buildRevenueForecastCommand(input) {
  return await buildRevenueForecast(input);
}

export async function buildProfitAndLossForecastCommand(input) {
  return await buildProfitAndLossForecast(input);
}

export async function buildForecastScenariosCommand(input) {
  return await buildForecastScenarios(input);
}

export async function getFinanceSummaryCommand(input) {
  return await getFinanceSummary(input);
}

export async function run(
  input,
  params = null
) {

  let reportName;
  let payload;

  if (typeof input === "string") {
    reportName = input;
    payload = params || {};
  } else {
    const {
      type,
      reportType,
      ...rest
    } = input || {};

    reportName = reportType || type;
    payload = rest;
  }

  if (!reportName) {
    throw new Error("Report type required");
  }

  return await runReportRuntime(
    reportName,
    payload
  );
}
