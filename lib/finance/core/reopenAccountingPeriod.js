import { supabase } from "@/lib/supabase";

export async function reopenAccountingPeriod({
  tenantId,
  accountingPeriod,
  reopenedBy,
}) {
  const { data, error } =
    await supabase
      .from(
        "accounting_period_locks"
      )
      .update({
        locked: false,
        reopened_by:
          reopenedBy,
        reopened_at:
          new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq(
        "accounting_period",
        accountingPeriod
      )
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
