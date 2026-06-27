import { createServerSupabase } from "@/lib/shared/supabase/server";
import { postAccountingEvent } from "@/lib/finance/postAccountingEvent";

export async function postPayroll({
  organizationId,
  payrollId,
  amount,
  accounts,
}) {
  return await postAccountingEvent({
    organizationId,
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
