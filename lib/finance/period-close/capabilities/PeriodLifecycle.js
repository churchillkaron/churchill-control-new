import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function openAccountingPeriod({
  organizationId,
  name,
  startDate,
  endDate,
  entityId = null,
  createdBy = "system",
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!name || !startDate || !endDate) throw new Error("Missing required fields");

  const { data: existing } = await supabaseAdmin
    .from("accounting_periods")
    .select("*")
    .eq("organization_id", organizationId)
    .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

  if (existing && existing.length > 0) {
    throw new Error("Period overlap detected");
  }

  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .insert([{
      organization_id: organizationId,
      entity_id: entityId,
      name,
      start_date: startDate,
      end_date: endDate,
      status: "open",
      created_by: createdBy,
    }])
    .select()
    .single();

  if (error) throw error;

  await supabaseAdmin.from("audit_logs").insert([{
    organization_id: organizationId,
    action: "ACCOUNTING_PERIOD_CREATED",
    entity_type: "accounting_period",
    entity_id: data.id,
    metadata: { name, startDate, endDate, entityId, createdBy },
  }]);

  return { success: true, period: data };
}

export async function updateAccountingPeriodStatus({
  organizationId,
  periodId,
  status,
  userId = "system",
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!periodId) throw new Error("periodId required");
  if (!status) throw new Error("status required");

  const allowed = ["open", "soft_closed", "closed", "locked"];
  if (!allowed.includes(status)) throw new Error("Invalid period status");

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("accounting_periods")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", periodId)
    .single();

  if (fetchError || !existing) throw new Error("Accounting period not found");
  if (existing.status === "locked") throw new Error("Locked accounting period cannot be changed");

  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .update({
      status,
      closed_at: status === "closed" || status === "locked" ? new Date().toISOString() : null,
      closed_by: status === "closed" || status === "locked" ? userId : null,
      locked_at: status === "locked" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", periodId)
    .select()
    .single();

  if (error) throw error;

  await supabaseAdmin.from("audit_logs").insert([{
    organization_id: organizationId,
    action: "ACCOUNTING_PERIOD_STATUS_UPDATED",
    entity_type: "accounting_period",
    entity_id: periodId,
    metadata: { from: existing.status, to: status, userId },
  }]);

  return { success: true, period: data };
}
