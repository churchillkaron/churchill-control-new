import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { resolvePOSFinancialPolicy } from "@/lib/pos/runtime/resolvePOSFinancialPolicy";
import { assertPOSActionAllowed, getPOSAccessSnapshot } from "@/lib/operations/commerce/security/POSActionPolicy";
import { runEventProcessors } from "@/lib/workers/system/runEventProcessors";

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function actorFromAccess(access = {}) {
  const snapshot = getPOSAccessSnapshot(access);
  return {
    staff_id: access.access?.staffAccountId || access.staff?.id || null,
    role: snapshot.role || null,
  };
}

async function validateScope({ organizationId, entityId }) {
  if (!entityId) {
    const error = new Error("Select an active legal entity before correcting a restaurant item");
    error.status = 400;
    throw error;
  }

  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) {
    const error = new Error("Selected legal entity is outside the organization or inactive");
    error.status = 403;
    throw error;
  }

  return entity;
}

async function dispatchCorrectionEvent({ organizationId, eventId }) {
  if (!eventId) return { pending: false, error: null };

  try {
    const dispatch = await runEventProcessors({ organizationId, eventId, limit: 1 });
    const pending =
      dispatch?.success === false ||
      Number(dispatch?.failed || 0) > 0 ||
      Boolean(dispatch?.failures?.length);

    return {
      pending,
      error: pending
        ? dispatch?.failures?.[0]?.error || dispatch?.error || "Restaurant item correction event dispatch incomplete"
        : null,
    };
  } catch (error) {
    return {
      pending: true,
      error: error?.message || "Restaurant item correction event dispatch failed",
    };
  }
}

export async function executeRestaurantItemCorrection({
  body = {},
  access,
  application,
  organizationId,
  request,
}) {
  assertPOSActionAllowed({ access, action: "VOID_ORDER_ITEM" });

  const actor = actorFromAccess(access);
  if (!actor.staff_id) {
    const error = new Error("Authenticated staff identity required to void a restaurant item");
    error.status = 403;
    throw error;
  }

  const correctionType = String(
    body.correctionType || body.correction_type || body.action || "VOID"
  ).trim().toUpperCase();
  if (correctionType !== "VOID") {
    const error = new Error("Only VOID is governed for restaurant items at this stage");
    error.status = 400;
    throw error;
  }

  const entityId =
    readValue(body, "entityId", "entity_id") ||
    readValue(body, "legalEntityId", "legal_entity_id") ||
    null;
  await validateScope({ organizationId, entityId });

  const orderId = readValue(body, "orderId", "order_id");
  const orderItemId = readValue(body, "orderItemId", "order_item_id") || readValue(body, "itemId", "item_id");
  const reason = String(body.reason || body.notes || "").trim();
  if (!orderId || !orderItemId) {
    const error = new Error("orderId and orderItemId required");
    error.status = 400;
    throw error;
  }
  if (!reason) {
    const error = new Error("Void reason required");
    error.status = 400;
    throw error;
  }

  const applicationId = String(
    body.applicationId || body.application_id || application?.id || "restaurant"
  ).trim().toLowerCase();
  if (applicationId !== "restaurant") {
    const error = new Error("Restaurant item corrections are only available for the restaurant POS application");
    error.status = 400;
    throw error;
  }

  const financialPolicy = await resolvePOSFinancialPolicy({
    organizationId,
    entityId,
    transactionDate: new Date().toISOString(),
  });
  if (!financialPolicy?.entityId || String(financialPolicy.entityId) !== String(entityId)) {
    const error = new Error("Current POS financial policy does not match the selected legal entity");
    error.status = 409;
    throw error;
  }

  const idempotencyKey =
    body.idempotencyKey ||
    body.idempotency_key ||
    request?.headers?.get?.("idempotency-key") ||
    `restaurant-item-void:${organizationId}:${orderItemId}:${crypto.randomUUID()}`;

  const result = await supabaseAdmin.rpc("restaurant_void_order_item_atomic", {
    p_organization_id: organizationId,
    p_entity_id: entityId,
    p_application_id: applicationId,
    p_order_id: orderId,
    p_order_item_id: orderItemId,
    p_actor_id: actor.staff_id,
    p_actor_role: actor.role,
    p_reason: reason,
    p_service_charge_rate: Number(financialPolicy.serviceChargeRate || 0),
    p_tax_rate: Number(financialPolicy.taxRate || 0),
    p_prices_include_tax: Boolean(financialPolicy.pricesIncludeTax),
    p_idempotency_key: String(idempotencyKey),
  });

  if (result.error) {
    const unavailable =
      result.error.code === "PGRST202" ||
      String(result.error.message || "").includes("restaurant_void_order_item_atomic");
    if (unavailable) {
      const error = new Error("Restaurant item VOID lifecycle is not deployed in the database");
      error.status = 503;
      throw error;
    }
    throw result.error;
  }

  const correction = result.data || {};
  const dispatch = await dispatchCorrectionEvent({
    organizationId,
    eventId: correction.event_id || null,
  });

  return {
    organization_id: organizationId,
    entity_id: entityId,
    application_id: applicationId,
    correction_type: "VOID",
    correction: correction.correction || null,
    order: correction.order || null,
    order_item: correction.order_item || null,
    duplicate: correction.duplicate === true,
    event_id: correction.event_id || null,
    dispatch_pending: dispatch.pending,
    dispatch_error: dispatch.error,
    policy: {
      supervisor_only: true,
      pre_production_only: true,
      unpaid_only: true,
      preserves_original_item: true,
      reason_required: true,
      comp_enabled: false,
      discount_enabled: false,
    },
  };
}

export default Object.freeze({
  execute: executeRestaurantItemCorrection,
});
