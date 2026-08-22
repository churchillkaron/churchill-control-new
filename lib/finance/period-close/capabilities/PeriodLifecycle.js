import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeDate(value, field) {
  const normalized = String(value || "").trim().slice(0, 10);
  const parsed = normalized ? new Date(`${normalized}T00:00:00.000Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid date`);
  return normalized;
}

export async function openAccountingPeriod({
  organizationId,
  name,
  startDate,
  endDate,
  entityId = null,
  createdBy = null,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!String(name || "").trim()) throw new Error("Period Name required");
  if (!createdBy) throw new Error("Authenticated creator required");

  const normalizedStart = normalizeDate(startDate, "Start Date");
  const normalizedEnd = normalizeDate(endDate, "End Date");
  if (normalizedStart > normalizedEnd) {
    throw new Error("Start Date cannot be after End Date");
  }

  if (entityId) {
    const { data: entity, error: entityError } = await supabaseAdmin
      .from("legal_entities")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", entityId)
      .maybeSingle();
    if (entityError) throw entityError;
    if (!entity) throw new Error("Legal Entity not found in this organisation");
  }

  let overlapQuery = supabaseAdmin
    .from("accounting_periods")
    .select("id, name, start_date, end_date, entity_id")
    .eq("organization_id", organizationId)
    .lte("start_date", normalizedEnd)
    .gte("end_date", normalizedStart);

  overlapQuery = entityId
    ? overlapQuery.eq("entity_id", entityId)
    : overlapQuery.is("entity_id", null);

  const { data: existing, error: overlapError } = await overlapQuery.limit(1);
  if (overlapError) throw overlapError;
  if ((existing || []).length > 0) {
    throw new Error("Period overlap detected in the selected legal-entity scope");
  }

  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .insert([{
      organization_id: organizationId,
      entity_id: entityId,
      name: String(name).trim(),
      start_date: normalizedStart,
      end_date: normalizedEnd,
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
    metadata: {
      name: data.name,
      startDate: normalizedStart,
      endDate: normalizedEnd,
      entityId,
      createdBy,
    },
  }]);

  return { success: true, period: data };
}

export async function updateAccountingPeriodStatus({
  organizationId,
  periodId,
  status,
  userId = null,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!periodId) throw new Error("periodId required");
  if (!status) throw new Error("status required");
  if (!userId) throw new Error("Authenticated user required");

  const normalizedStatus = String(status).trim().toLowerCase();
  const allowed = ["open", "soft_closed", "closed", "locked"];
  if (!allowed.includes(normalizedStatus)) throw new Error("Invalid period status");

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("accounting_periods")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", periodId)
    .single();

  if (fetchError || !existing) throw new Error("Accounting period not found");
  if (String(existing.status || "").toLowerCase() === "locked") {
    throw new Error("Locked accounting period cannot be changed");
  }

  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .update({
      status: normalizedStatus,
      closed_at:
        normalizedStatus === "closed" || normalizedStatus === "locked"
          ? new Date().toISOString()
          : null,
      closed_by:
        normalizedStatus === "closed" || normalizedStatus === "locked"
          ? userId
          : null,
      locked_at: normalizedStatus === "locked" ? new Date().toISOString() : null,
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
    metadata: { from: existing.status, to: normalizedStatus, userId },
  }]);

  return { success: true, period: data };
}
