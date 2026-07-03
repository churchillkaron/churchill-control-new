import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function approvePayrollRecord(payload) {
  return payrollFinanceContract({
    type: "PAYROLL_LEDGER",
    payload
  });
}
