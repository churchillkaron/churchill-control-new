import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";

function requiredText(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function dateOnly(value, field) {
  const normalized = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${field} must be a valid date`);
  }
  return normalized;
}

function actorId(value) {
  const normalized = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

async function requireScopedEntity({ organizationId, entityId }) {
  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) {
    throw new Error("Legal entity not found in organisation");
  }
  return entity.id;
}

export async function openAccountingPeriod({
  organizationId,
  name,
  startDate,
  endDate,
  entityId,
  createdBy = null,
}) {
  const scopedOrganizationId = requiredText(organizationId, "organizationId");
  const scopedEntityId = await requireScopedEntity({
    organizationId: scopedOrganizationId,
    entityId: requiredText(entityId, "entityId"),
  });
  const periodName = requiredText(name, "name");
  const start = dateOnly(startDate, "startDate");
  const end = dateOnly(endDate, "endDate");

  if (start > end) {
    throw new Error("startDate cannot be after endDate");
  }

  const { data: existing, error: overlapError } = await supabaseAdmin
    .from("accounting_periods")
    .select("id, name, start_date, end_date, status")
    .eq("organization_id", scopedOrganizationId)
    .eq("entity_id", scopedEntityId)
    .lte("start_date", end)
    .gte("end_date", start)
    .limit(1);

  if (overlapError) throw overlapError;
  if ((existing || []).length > 0) {
    throw new Error("Accounting period overlaps an existing period for this legal entity");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .insert({
      organization_id: scopedOrganizationId,
      entity_id: scopedEntityId,
      name: periodName,
      start_date: start,
      end_date: end,
      status: "open",
      created_by: actorId(createdBy),
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw error;

  const { error: auditError } = await supabaseAdmin
    .from("audit_logs")
    .insert({
      organization_id: scopedOrganizationId,
      action: "ACCOUNTING_PERIOD_CREATED",
      entity_type: "accounting_period",
      entity_id: data.id,
      metadata: {
        legal_entity_id: scopedEntityId,
        name: periodName,
        start_date: start,
        end_date: end,
        created_by: actorId(createdBy),
      },
    });

  if (auditError) throw auditError;

  return { success: true, period: data };
}

const DIRECT_TRANSITIONS = Object.freeze({
  open: new Set(["soft_closed"]),
  soft_closed: new Set(["open"]),
});

export async function updateAccountingPeriodStatus({
  organizationId,
  entityId,
  periodId,
  status,
  userId = null,
}) {
  const scopedOrganizationId = requiredText(organizationId, "organizationId");
  const scopedEntityId = await requireScopedEntity({
    organizationId: scopedOrganizationId,
    entityId: requiredText(entityId, "entityId"),
  });
  const scopedPeriodId = requiredText(periodId, "periodId");
  const targetStatus = requiredText(status, "status").toLowerCase();

  if (["closed", "locked"].includes(targetStatus)) {
    throw new Error(
      "Closed and locked statuses may only be applied by the atomic period-close workflow"
    );
  }

  if (!["open", "soft_closed"].includes(targetStatus)) {
    throw new Error("Invalid direct period status");
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("accounting_periods")
    .select("*")
    .eq("organization_id", scopedOrganizationId)
    .eq("entity_id", scopedEntityId)
    .eq("id", scopedPeriodId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!existing) throw new Error("Accounting period not found in selected legal entity");

  const currentStatus = String(existing.status || "open").toLowerCase();
  if (["closed", "locked"].includes(currentStatus)) {
    throw new Error("Closed or locked accounting periods cannot be reopened directly");
  }

  if (currentStatus === targetStatus) {
    return { success: true, period: existing, unchanged: true };
  }

  if (!DIRECT_TRANSITIONS[currentStatus]?.has(targetStatus)) {
    throw new Error(`Invalid period status transition: ${currentStatus} to ${targetStatus}`);
  }

  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .update({
      status: targetStatus,
      closed_at: null,
      closed_by: null,
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", scopedOrganizationId)
    .eq("entity_id", scopedEntityId)
    .eq("id", scopedPeriodId)
    .select()
    .single();

  if (error) throw error;

  const { error: auditError } = await supabaseAdmin
    .from("audit_logs")
    .insert({
      organization_id: scopedOrganizationId,
      action: "ACCOUNTING_PERIOD_STATUS_UPDATED",
      entity_type: "accounting_period",
      entity_id: scopedPeriodId,
      metadata: {
        legal_entity_id: scopedEntityId,
        from: currentStatus,
        to: targetStatus,
        user_id: actorId(userId),
      },
    });

  if (auditError) throw auditError;

  return { success: true, period: data };
}
