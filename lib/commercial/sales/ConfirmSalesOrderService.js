import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value, field) {
  const normalized = String(value || "").trim();
  if (!UUID_PATTERN.test(normalized)) {
    const error = new Error(`${field} must be a UUID`);
    error.status = 400;
    throw error;
  }
  return normalized;
}

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function actorId(access = {}) {
  return (
    access.access?.staffAccountId ||
    access.staff?.id ||
    access.user?.id ||
    null
  );
}

export async function confirmSalesOrder({
  access,
  body = {},
  organizationId,
  request,
}) {
  const entityId = uuid(
    body.entityId ||
      body.entity_id ||
      body.legalEntityId ||
      body.legal_entity_id,
    "entity_id"
  );
  const salesOrderId = uuid(
    body.salesOrderId ||
      body.sales_order_id ||
      body.orderId ||
      body.order_id,
    "sales_order_id"
  );

  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) {
    const error = new Error(
      "Selected legal entity is outside the organization or inactive"
    );
    error.status = 403;
    throw error;
  }

  const resolvedActorId = actorId(access);
  if (!resolvedActorId || !UUID_PATTERN.test(String(resolvedActorId))) {
    const error = new Error(
      "Authenticated staff identity is required to confirm a sales order"
    );
    error.status = 403;
    throw error;
  }

  const idempotencyKey =
    text(body.idempotencyKey || body.idempotency_key) ||
    request?.headers?.get?.("idempotency-key");
  if (!idempotencyKey) {
    const error = new Error("idempotency_key required");
    error.status = 400;
    throw error;
  }

  const result = await supabaseAdmin.rpc(
    "commercial_confirm_sales_order_atomic",
    {
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_sales_order_id: salesOrderId,
      p_actor_id: resolvedActorId,
      p_idempotency_key: idempotencyKey,
    }
  );

  if (result.error) {
    const unavailable =
      ["PGRST202", "PGRST205", "42P01"].includes(result.error.code) ||
      /commercial_confirm_sales_order_atomic|inventory_reservations/i.test(
        result.error.message || ""
      );

    if (unavailable) {
      const error = new Error(
        "Sales-order confirmation and inventory reservation migration is not deployed"
      );
      error.status = 503;
      throw error;
    }

    const message = result.error.message || "Unable to confirm sales order";
    const error = new Error(message);
    error.status = /insufficient|only draft|no active number sequence|not found|required/i.test(
      message
    )
      ? 409
      : 500;
    throw error;
  }

  return {
    ...(result.data || {}),
    success: true,
    entity_id: entityId,
    sales_order_id: salesOrderId,
    idempotency_key: idempotencyKey,
  };
}

export default confirmSalesOrder;
