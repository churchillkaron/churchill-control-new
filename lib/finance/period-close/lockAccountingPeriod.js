import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function lockAccountingPeriod({
  organizationId,
  accountingPeriod,
  lockedBy,
}) {
  const { data, error } =
    await supabaseAdmin
      .from(
        "accounting_period_locks"
      )
      .insert({
        organization_id: organizationId,
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
