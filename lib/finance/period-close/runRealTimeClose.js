import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runRealTimeClose({
  organizationId,
  closeDate,
}) {
  const exceptions = [];

  const { data: profitability } =
    await supabase
      .from(
        "profitability_snapshots"
      )
      .select("*")
      .eq("organization_id", organizationId);

  if (
    !profitability ||
    profitability.length === 0
  ) {
    exceptions.push({
      module_name:
        "PROFITABILITY",
      severity: "high",
      exception_message:
        "Profitability snapshots missing",
    });
  }

  const { data: inventory } =
    await supabase
      .from(
        "inventory_ledger"
      )
      .select("*")
      .eq("organization_id", organizationId);

  if (
    !inventory ||
    inventory.length === 0
  ) {
    exceptions.push({
      module_name:
        "INVENTORY",
      severity: "high",
      exception_message:
        "Inventory ledger missing",
    });
  }

  const close =
    await supabase
      .from(
        "real_time_close_cycles"
      )
      .insert({
        organization_id: organizationId,
        close_date: closeDate,
        close_status:
          exceptions.length > 0
            ? "exceptions"
            : "ready",
        revenue_locked: true,
        inventory_locked:
          exceptions.length === 0,
        payroll_locked:
          exceptions.length === 0,
        accounting_locked:
          exceptions.length === 0,
      })
      .select()
      .single();

  if (exceptions.length > 0) {
    await supabase
      .from(
        "real_time_close_exceptions"
      )
      .insert(
        exceptions.map((e) => ({
          organization_id: organizationId,
          close_cycle_id:
            close.data.id,
          ...e,
        }))
      );
  }

  return {
    close: close.data,
    exceptions,
  };
}
