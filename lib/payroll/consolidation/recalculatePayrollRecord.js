import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function recalculatePayrollRecord(payload) {
  return payrollFinanceContract({
    type: "PAYROLL_ACCRUAL",
    payload
  });
}
