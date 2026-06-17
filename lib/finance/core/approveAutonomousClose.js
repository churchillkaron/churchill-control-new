import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function approveAutonomousClose({
  tenantId,
  cycleId,
  approvedBy,
}) {
  const { data: cycle, error } =
    await supabase
      .from(
        "accounting_autonomous_close_cycles"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", cycleId)
      .single();

  if (error || !cycle) {
    throw new Error(
      "Close cycle not found"
    );
  }

  if (
    cycle.ai_recommendation !==
    "READY_TO_CLOSE"
  ) {
    throw new Error(
      "Cycle not approved for close"
    );
  }

  const { data, error: updateError } =
    await supabase
      .from(
        "accounting_autonomous_close_cycles"
      )
      .update({
        cycle_status:
          "CLOSED",
        approved_by:
          approvedBy,
        approved_at:
          new Date().toISOString(),
      })
      .eq("id", cycleId)
      .select()
      .single();

  if (updateError) {
    throw updateError;
  }

  return data;
}
