import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function assertPeriodOpen(periodId) {
  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .select("status")
    .eq("id", periodId)
    .single();

  if (error || !data) {
    throw new Error("Accounting period not found");
  }

  if (["closed", "locked"].includes(data.status)) {
    throw new Error(`Finance Period Locked: ${periodId}`);
  }

  return true;
}

export async function lockPeriod(periodId) {
  const { error } = await supabaseAdmin
    .from("accounting_periods")
    .update({
      status: "locked",
      locked_at: new Date().toISOString(),
    })
    .eq("id", periodId);

  if (error) {
    throw error;
  }

  return true;
}

export async function isPeriodLocked(periodId) {
  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .select("status")
    .eq("id", periodId)
    .single();

  if (error || !data) return false;

  return ["closed", "locked"].includes(data.status);
}
