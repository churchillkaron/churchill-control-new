import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function processPayrollPayout(payload) {
  return payrollFinanceContract({
    type: "PAYROLL_SETTLEMENT",
    payload
  });
}
