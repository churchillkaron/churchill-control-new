import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { runEventProcessors } from "@/lib/workers/system/runEventProcessors";

const CORRECTION_ROLES = new Set([
  "MANAGER",
  "GENERAL_MANAGER",
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function normalizedRole(access = {}) {
  return String(access.role || access.access?.role || access.membership?.role || access.staff?.role || "").trim().toUpperCase();
}

function actorFromAccess(access = {}) {
  const role = normalizedRole(access);
  return {
    user_id: access.user?.id || null,
    staff_id: access.access?.staffAccountId || access.staff?.id || null,
    staff_name: access.staff?.name || access.staff?.display_name || access.user?.email || null,
    role: role || null,
    can_correct: CORRECTION_ROLES.has(role),
  };
}

function requestValue(request, keys) {
  try {
    const params = new URL(request?.url || "http://localhost").searchParams;
    for (const key of keys) {
      const value = params.get(key);
      if (value) return value;
    }
  } catch {}
  return null;
}

function resolveScope({ body = {}, application, request }) {
  const entityId = body.entityId || body.entity_id || body.legalEntityId || body.legal_entity_id || requestValue(request, ["entityId", "entity_id", "legalEntityId", "legal_entity_id"]) || null;
  const applicationId = String(body.applicationId || body.application_id || application?.id || requestValue(request, ["applicationId", "application_id"]) || "").trim().toLowerCase();
  if (!entityId) { const error = new Error("Select an active legal entity for payment corrections"); error.status = 400; throw error; }
  if (!applicationId) { const error = new Error("POS application required for payment corrections"); error.status = 400; throw error; }
  return { entityId, applicationId };
}

async function validateScope({ organizationId, entityId }) {
  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) { const error = new Error("Selected legal entity is outside the organization or inactive"); error.status = 403; throw error; }
}

async function dispatchCorrectionEvent({ organizationId, eventId }) {
  if (!eventId) return { pending: false, error: null };
  try {
    const dispatch = await runEventProcessors({ organizationId, eventId, limit: 1 });
    const pending = dispatch?.success === false || Number(dispatch?.failed || 0) > 0 || Boolean(dispatch?.failures?.length);
    return { pending, error: pending ? dispatch?.failures?.[0]?.error || dispatch?.error || "POS correction event dispatch incomplete" : null };
  } catch (error) {
    return { pending: true, error: error?.message || "POS correction event dispatch failed" };
  }
}

export async function loadPaymentCorrections({ access, application, organizationId, request }) {
  const actor = actorFromAccess(access);
  const scope = resolveScope({ application, request });
  await validateScope({ organizationId, entityId: scope.entityId });

  const [shiftResult, paymentResult, correctionResult] = await Promise.all([
    supabaseAdmin.from("pos_shifts").select("id, opening_cash, expected_cash, refund_total, reversal_total, status, locked, opened_at, created_at").eq("organization_id", organizationId).eq("entity_id", scope.entityId).eq("application_id", scope.applicationId).in("status", ["OPEN", "ACTIVE"]).eq("locked", false).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("payments").select("id, amount, currency, status, payment_method, payment_reference, document_number, paid_at, created_at, cash_session_id, order_id, source_document, source_document_id, journal_entry_id").eq("organization_id", organizationId).eq("entity_id", scope.entityId).eq("application_id", scope.applicationId).eq("payment_method", "CASH").in("status", ["PAID", "COMPLETED", "paid", "completed"]).order("paid_at", { ascending: false, nullsFirst: false }).limit(100),
    supabaseAdmin.from("pos_payment_corrections").select("id, original_payment_id, correction_type, amount, currency_code, reason, cash_session_id, original_cash_session_id, status, source_document, source_document_id, created_by, created_at").eq("organization_id", organizationId).eq("entity_id", scope.entityId).eq("application_id", scope.applicationId).order("created_at", { ascending: false }).limit(100),
  ]);

  if (shiftResult.error && shiftResult.error.code !== "PGRST116") throw shiftResult.error;
  if (paymentResult.error) throw paymentResult.error;
  if (correctionResult.error) throw correctionResult.error;

  const corrections = correctionResult.data || [];
  const correctionByPayment = new Map(corrections.map((correction) => [String(correction.original_payment_id), correction]));
  const payments = (paymentResult.data || []).map((payment) => {
    const correction = correctionByPayment.get(String(payment.id)) || null;
    return { ...payment, corrected: Boolean(correction), correction, eligible: !correction };
  });

  return {
    actor,
    organization_id: organizationId,
    entity_id: scope.entityId,
    application_id: scope.applicationId,
    active_cash_session: shiftResult.data || null,
    payments,
    corrections,
    policy: { cash_only: true, full_sale_only: true, requires_active_cash_session: true, requires_manager: true, preserves_original_payment: true },
  };
}

export async function executePaymentCorrection({ body, access, application, organizationId, request }) {
  const actor = actorFromAccess(access);
  const scope = resolveScope({ body, application, request });
  await validateScope({ organizationId, entityId: scope.entityId });
  if (!actor.can_correct || !actor.staff_id) { const error = new Error("Manager or owner role required for POS payment corrections"); error.status = 403; throw error; }

  const correctionType = String(body.correctionType || body.correction_type || body.action || "").trim().toUpperCase();
  if (!["REFUND", "REVERSAL"].includes(correctionType)) { const error = new Error("correctionType must be REFUND or REVERSAL"); error.status = 400; throw error; }
  const cashSessionId = body.cashSessionId || body.cash_session_id || body.sessionId || body.session_id || null;
  const paymentId = body.paymentId || body.payment_id || null;
  const reason = String(body.reason || body.notes || "").trim();
  if (!cashSessionId || !paymentId) { const error = new Error("cashSessionId and paymentId required"); error.status = 400; throw error; }
  if (!reason) { const error = new Error("Correction reason required"); error.status = 400; throw error; }
  const idempotencyKey = body.idempotencyKey || body.idempotency_key || request?.headers?.get?.("idempotency-key") || `pos-correction:${organizationId}:${crypto.randomUUID()}`;

  const result = await supabaseAdmin.rpc("pos_correct_payment_atomic", {
    p_organization_id: organizationId,
    p_entity_id: scope.entityId,
    p_application_id: scope.applicationId,
    p_cash_session_id: cashSessionId,
    p_payment_id: paymentId,
    p_correction_type: correctionType,
    p_actor_id: actor.staff_id,
    p_actor_role: actor.role,
    p_reason: reason,
    p_idempotency_key: String(idempotencyKey),
  });
  if (result.error) {
    if (result.error.code === "PGRST202" || String(result.error.message || "").includes("pos_correct_payment_atomic")) { const error = new Error("POS payment correction lifecycle is not deployed in the database"); error.status = 503; throw error; }
    throw result.error;
  }

  const dispatch = await dispatchCorrectionEvent({ organizationId, eventId: result.data?.event_id || null });
  return { ...scope, correction_type: correctionType, correction: result.data?.correction || null, session: result.data?.session || null, duplicate: Boolean(result.data?.duplicate), event_id: result.data?.event_id || null, dispatch_pending: dispatch.pending, dispatch_error: dispatch.error };
}

export default Object.freeze({ load: loadPaymentCorrections, execute: executePaymentCorrection });
