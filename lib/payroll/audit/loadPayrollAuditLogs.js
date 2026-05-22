import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function loadPayrollAuditLogs(
  tenantId
) {

  const {
    data,
    error,
  } = await supabaseAdmin

    .from(
      "payroll_audit_logs"
    )

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .order(
      "created_at",
      {
        ascending: false,
      }
    )

    .limit(100);

  if (error) {
    throw error;
  }

  return data || [];

}
