import runCashFlowEngine from "../workflows/runCashFlowEngine";
import buildRevenueForecast from "@/lib/finance/budgeting/capabilities/buildRevenueForecast";
import getFinanceSummary from "../capabilities/getFinanceSummary";

import {
  run as runReportRuntime,
} from "./ReportRuntime";

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
// REPORTS
// ==============================

export async function run(
  input,
  params = null
) {

  let reportName;
  let payload;


  if (typeof input === "string") {

    reportName = input;

    payload =
      params || {};

  } else {

    const {
      type,
      reportType,
      ...rest
    } = input || {};


    reportName =
      reportType ||
      type;


    payload =
      rest;

  }


  if (!reportName) {

    throw new Error(
      "Report type required"
    );

  }


  return await runReportRuntime(
    reportName,
    payload
  );

}
