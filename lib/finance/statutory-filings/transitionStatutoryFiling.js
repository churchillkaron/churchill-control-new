import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TRANSITIONS = Object.freeze({
  DRAFT: new Set(["IN_REVIEW"]),
  IN_REVIEW: new Set(["DRAFT", "SUBMITTED"]),
  SUBMITTED: new Set(["ACCEPTED", "REJECTED"]),
  REJECTED: new Set(["DRAFT"]),
  ACCEPTED: new Set(),
});

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function actorId(value) {
  const normalized = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

function normalizeStatus(value) {
  return required(value, "status")
    .toUpperCase()
    .replace(/\s+/g, "_");
}

export async function transitionStatutoryFiling({
  organizationId,
  entityId,
  filingId,
  status,
  submissionReference = null,
  reason = null,
  actor = null,
}) {
  const scopedOrganizationId = required(organizationId, "organizationId");
  const scopedEntityId = required(entityId, "entityId");
  const scopedFilingId = required(filingId, "filingId");
  const targetStatus = normalizeStatus(status);

  const { data: filing, error: loadError } = await supabaseAdmin
    .from("finance_statutory_filings")
    .select("*")
    .eq("organization_id", scopedOrganizationId)
    .eq("entity_id", scopedEntityId)
    .eq("id", scopedFilingId)
    .maybeSingle();

  if (loadError) throw loadError;
  if (!filing) {
    throw new Error("Statutory filing not found in selected legal entity");
  }

  const currentStatus = normalizeStatus(filing.status || "DRAFT");
  if (currentStatus === targetStatus) {
    return { success: true, filing, unchanged: true };
  }

  if (!TRANSITIONS[currentStatus]?.has(targetStatus)) {
    throw new Error(
      `Invalid statutory filing transition: ${currentStatus} to ${targetStatus}`
    );
  }

  const normalizedReference = String(submissionReference || "").trim() || null;
  const normalizedReason = String(reason || "").trim() || null;

  if (targetStatus === "SUBMITTED" && !normalizedReference) {
    throw new Error("submission_reference required when submitting a filing");
  }

  if (targetStatus === "REJECTED" && !normalizedReason) {
    throw new Error("reason required when rejecting a filing");
  }

  const now = new Date().toISOString();
  const update = {
    status: targetStatus,
    updated_at: now,
  };

  if (targetStatus === "SUBMITTED") {
    update.submission_reference = normalizedReference;
  }

  const { data, error } = await supabaseAdmin
    .from("finance_statutory_filings")
    .update(update)
    .eq("organization_id", scopedOrganizationId)
    .eq("entity_id", scopedEntityId)
    .eq("id", scopedFilingId)
    .eq("status", filing.status)
    .select("*")
    .single();

  if (error) throw error;

  const { error: auditError } = await supabaseAdmin
    .from("audit_logs")
    .insert({
      organization_id: scopedOrganizationId,
      action: "STATUTORY_FILING_STATUS_CHANGED",
      entity_type: "finance_statutory_filing",
      entity_id: scopedFilingId,
      metadata: {
        legal_entity_id: scopedEntityId,
        from: currentStatus,
        to: targetStatus,
        submission_reference: normalizedReference,
        reason: normalizedReason,
        actor_id: actorId(actor),
      },
    });

  if (auditError) throw auditError;

  return { success: true, filing: data };
}
