import { supabase } from "@/lib/supabase";

export async function runContinuousClose({
  tenantId,
  closePeriod,
}) {
  const checks = [];
  const exceptions = [];

  const { data: run } =
    await supabase
      .from(
        "accounting_continuous_close_runs"
      )
      .insert({
        tenant_id: tenantId,
        close_period:
          closePeriod,
        close_status:
          "running",
      })
      .select()
      .single();

  const { data: events } =
    await supabase
      .from("accounting_event_bus")
      .select("*")
      .eq("tenant_id", tenantId);

  checks.push({
    type:
      "UNPOSTED_EVENTS",
    passed:
      events.every(
        (e) =>
          e.status === "posted"
      ),
  });

  for (const event of events || []) {
    if (
      event.status !== "posted"
    ) {
      exceptions.push({
        tenant_id: tenantId,
        close_run_id:
          run.id,
        exception_type:
          "UNPOSTED_EVENT",
        severity: "high",
        reference_id:
          event.id,
        exception_message:
          `Event ${event.event_type} not posted`,
      });
    }
  }

  const { data: reconciliations } =
    await supabase
      .from(
        "bank_reconciliations"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  checks.push({
    type:
      "BANK_RECONCILIATION",
    passed:
      reconciliations.every(
        (r) =>
          r.reconciliation_status ===
          "balanced"
      ),
  });

  for (const row of reconciliations || []) {
    if (
      row.reconciliation_status !==
      "balanced"
    ) {
      exceptions.push({
        tenant_id: tenantId,
        close_run_id:
          run.id,
        exception_type:
          "BANK_VARIANCE",
        severity: "high",
        reference_id:
          row.id,
        exception_message:
          "Bank reconciliation out of balance",
      });
    }
  }

  if (exceptions.length > 0) {
    await supabase
      .from(
        "accounting_close_exceptions"
      )
      .insert(exceptions);
  }

  const passedChecks =
    checks.filter(
      (c) => c.passed
    ).length;

  const failedChecks =
    checks.length -
    passedChecks;

  await supabase
    .from(
      "accounting_continuous_close_runs"
    )
    .update({
      total_checks:
        checks.length,
      passed_checks:
        passedChecks,
      failed_checks:
        failedChecks,
      close_status:
        failedChecks === 0
          ? "ready_to_close"
          : "exceptions_detected",
      completed_at:
        new Date().toISOString(),
    })
    .eq("id", run.id);

  return {
    checks,
    exceptions,
  };
}
