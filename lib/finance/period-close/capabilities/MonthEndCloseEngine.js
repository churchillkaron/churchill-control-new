import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { lockPeriod } from "@/lib/finance/period-close/capabilities/PeriodLock";

export async function runMonthEndClose({
  organizationId,
  periodId,
  closedBy = "system",
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!periodId) {
    throw new Error("periodId required");
  }

  const { data: period, error: periodError } =
    await supabaseAdmin
      .from("accounting_periods")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", periodId)
      .single();

  if (periodError || !period) {
    throw new Error("Accounting period not found");
  }

  if (period.status === "locked") {
    throw new Error("Accounting period already locked");
  }

  const { count: unpostedJournals, error: journalError } =
    await supabaseAdmin
      .from("journal_entries")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("organization_id", organizationId)
      .eq("entity_id", period.entity_id)
      .neq("status", "POSTED");

  if (journalError) {
    throw journalError;
  }

  if ((unpostedJournals || 0) > 0) {
    throw new Error("Month close blocked: unposted journals exist");
  }

  const { data: updated, error: updateError } =
    await supabaseAdmin
      .from("accounting_periods")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: closedBy,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("id", periodId)
      .select()
      .single();

  if (updateError) {
    throw updateError;
  }

  await lockPeriod(periodId);

  await supabaseAdmin
    .from("audit_logs")
    .insert([{
      organization_id: organizationId,
      action: "ACCOUNTING_PERIOD_CLOSED",
      entity_type: "accounting_period",
      entity_id: periodId,
      metadata: {
        period: period.name,
        start_date: period.start_date,
        end_date: period.end_date,
        closedBy,
      },
    }]);

  return {
    success: true,
    status: "locked",
    period: updated,
  };
}
