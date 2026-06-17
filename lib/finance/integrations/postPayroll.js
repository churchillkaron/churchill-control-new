import { createServerSupabase } from "@/lib/shared/supabase/server";
import { postAccountingEvent } from "@/lib/finance/postAccountingEvent";

export async function postPayroll({
  tenantId,
  payrollId,
  amount,
  accounts,
}) {
  return await postAccountingEvent({
    tenantId,
    eventType: "PAYROLL_POSTED",
    sourceModule: "payroll",
    sourceId: payrollId,
    description: `Payroll posting ${payrollId}`,
    amount,
    accounts,
    metadata: {
      payrollId,
    },
  });
}
