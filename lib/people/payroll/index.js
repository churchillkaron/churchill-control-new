// People owns the payroll business capability. The mature payroll engine remains
// behind this seam while its internals are converged incrementally. Application
// routes and People/Workforce surfaces must import payroll behavior from here,
// not directly from lib/payroll.

import buildEnginePayrollReadiness from "@/lib/payroll/readiness/buildPayrollReadiness";
import buildPayrollFrequencyReadiness from "./buildPayrollFrequencyReadiness";

export {
  default as generateMonthlyPayroll,
  calculateMonthlyPayroll,
} from "@/lib/payroll/consolidation/generateMonthlyPayroll";

export async function buildPayrollReadiness({
  organizationId,
  entityId,
  payrollMonth,
}) {
  const [readiness, frequencyReadiness] = await Promise.all([
    buildEnginePayrollReadiness({ organizationId, entityId, payrollMonth }),
    buildPayrollFrequencyReadiness({ organizationId, entityId, payrollMonth }),
  ]);

  if (!frequencyReadiness.blocker) {
    return {
      ...readiness,
      supportedPayrollFrequency: frequencyReadiness.supportedPayrollFrequency,
      summary: {
        ...(readiness.summary || {}),
        unsupportedPayrollFrequency: 0,
      },
    };
  }

  const blockers = [...(readiness.blockers || []), frequencyReadiness.blocker];

  return {
    ...readiness,
    supportedPayrollFrequency: frequencyReadiness.supportedPayrollFrequency,
    summary: {
      ...(readiness.summary || {}),
      unsupportedPayrollFrequency: frequencyReadiness.unsupportedCount,
    },
    blockers,
    canGenerate: false,
    canCompleteLifecycle: false,
  };
}

export { default as resolvePayrollJurisdiction } from "@/lib/payroll/countries/resolvePayrollJurisdiction";

export { approvePayrollRecord } from "@/lib/payroll/consolidation/approvePayrollRecord";
export { default as rejectPayrollRecord } from "@/lib/payroll/consolidation/rejectPayrollRecord";
export { default as lockPayrollRecord } from "@/lib/payroll/consolidation/lockPayrollRecord";
export { default as resolvePayrollDispute } from "@/lib/payroll/consolidation/resolvePayrollDispute";
export { recalculatePayrollRecord } from "@/lib/payroll/consolidation/recalculatePayrollRecord";
export { default as reviewAttendancePenalty } from "@/lib/payroll/consolidation/reviewAttendancePenalty";
export { default as finalizePayrollRecord } from "@/lib/payroll/consolidation/finalizePayrollRecord";
export { default as closePayrollAccountingPeriod } from "@/lib/payroll/consolidation/closePayrollAccountingPeriod";
export { default as certifyPayrollRecord } from "@/lib/payroll/consolidation/certifyPayrollRecord";
export { default as archivePayrollRecord } from "@/lib/payroll/consolidation/archivePayrollRecord";

export {
  default as loadPayrollAttendanceReconciliation,
  isPayrollAttendanceSnapshotStale,
} from "@/lib/payroll/consolidation/loadPayrollAttendanceReconciliation";

export { default as preparePayrollPaymentBatch } from "@/lib/payroll/payments/preparePayrollPaymentBatch";
export { default as reconcilePayrollPaymentBatch } from "@/lib/payroll/payments/reconcilePayrollPaymentBatch";
export { default as generatePayslipPdf } from "@/lib/payroll/payslips/generatePayslipPdf";
export { default as acknowledgePayrollRecord } from "@/lib/payroll/consolidation/acknowledgePayrollRecord";
export { default as disputePayrollRecord } from "@/lib/payroll/consolidation/disputePayrollRecord";
