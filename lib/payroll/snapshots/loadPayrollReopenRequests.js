import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function loadPayrollReopenRequests(
  tenantId
) {

  const {
    data,
    error,
  } = await supabaseAdmin

    .from(
      "payroll_reopen_requests"
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
    );

  if (error) {
    throw error;
  }

  return data || [];

}
