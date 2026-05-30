import { supabase } from "@/lib/supabase";

export async function lockAccountingPeriod({
  tenantId,
  accountingPeriod,
  lockedBy,
}) {
  const { data, error } =
    await supabase
      .from(
        "accounting_period_locks"
      )
      .insert({
        tenant_id: tenantId,
        accounting_period:
          accountingPeriod,
        locked: true,
        locked_by: lockedBy,
        locked_at:
          new Date().toISOString(),
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
