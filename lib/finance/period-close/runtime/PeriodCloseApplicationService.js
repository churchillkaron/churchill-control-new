import runMonthEndClose from "../workflows/runMonthlyClose";
import runYearEndClose from "../workflows/runYearEndClose";
import {
  openAccountingPeriod,
  updateAccountingPeriodStatus
} from "../capabilities/PeriodLifecycle";

export async function runMonthEndCloseCommand(input) {
  return await runMonthEndClose(input);
}

export async function runYearEndCloseCommand(input) {
  return await runYearEndClose(input);
}

export async function openAccountingPeriodCommand(input) {
  return await openAccountingPeriod(input);
}

export async function updateAccountingPeriodStatusCommand(input) {
  return await updateAccountingPeriodStatus(input);
}
