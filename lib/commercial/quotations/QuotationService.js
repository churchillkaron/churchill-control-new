import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import {
  loadQuotation,
  searchQuotations,
} from "@/lib/commercial/repositories/quotations/repository";
import {
  actorFrom,
  numeric,
  requestedEntityId,
  resolveCommercialDocumentContext,
  text,
  uuidOrNull,
} from "@/lib/commercial/sales/CommercialDocumentContext";

function defaultValidUntil() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

export async function listQuotations({
  organizationId,
  entityId,
  status = null,
  limit = 200,
}) {
  if (!uuidOrNull(entityId)) {
    const error = new Error("Select an active legal entity before loading quotations");
    error.status = 400;
    throw error;
  }

  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) {
    const error = new Error(
      "Selected legal entity is outside the organization or inactive"
    );
    error.status = 403;
    throw error;
  }

  const quotations = await searchQuotations({
    organizationId,
    entityId,
    status,
    limit,
  });

  return quotations.map((quotation) => ({
    ...quotation,
    document_number: quotation.quotation_number,
    document_type: "QUOTATION",
    total: Number(quotation.total_amount || 0),
    active: !["CLOSED", "CANCELLED", "REJECTED", "EXPIRED"].includes(
      String(quotation.status || "").toUpperCase()
    ),
  }));
}

export async function createQuotation({
  access,
  body = {},
  organizationId,
  request,
}) {
  const entityId = requestedEntityId(body, request);
  const partyId = uuidOrNull(body.partyId || body.party_id);
  if (!partyId) {
    const error = new Error("Select a customer Party before creating a quotation");
    error.status = 400;
    throw error;
  }

  const sourceItems = Array.isArray(body.items) ? body.items : [];
  const context = await resolveCommercialDocumentContext({
    organizationId,
    entityId,
    partyId,
    sourceItems,
  });
  const actor = actorFrom(access);
  const idempotencyKey =
    text(body.idempotencyKey || body.idempotency_key) ||
    request?.headers?.get?.("idempotency-key") ||
    `quotation-create:${organizationId}:${entityId}:${crypto.randomUUID()}`;

  const result = await supabaseAdmin.rpc("commercial_create_quotation_atomic", {
    p_organization_id: organizationId,
    p_entity_id: entityId,
    p_party_id: context.partyId,
    p_customer_name: text(body.customerName || body.customer_name),
    p_customer_email: text(body.customerEmail || body.customer_email),
    p_customer_phone: text(body.customerPhone || body.customer_phone),
    p_currency_code: context.currencyCode,
    p_prices_include_tax: Boolean(context.financialPolicy.pricesIncludeTax),
    p_tax_code_id: uuidOrNull(context.financialPolicy.taxCodeId),
    p_tax_code: context.financialPolicy.taxCode || null,
    p_tax_rate: numeric(context.financialPolicy.taxRate, 0),
    p_items: context.lines,
    p_valid_until:
      text(body.validUntil || body.valid_until) || defaultValidUntil(),
    p_notes: text(body.notes),
    p_terms: text(body.terms),
    p_actor_staff_id: actor.staffId,
    p_actor_name: actor.name,
    p_idempotency_key: idempotencyKey,
  });

  if (result.error) {
    const unavailable =
      ["PGRST202", "PGRST205", "42883", "42P01"].includes(result.error.code) ||
      /commercial_create_quotation_atomic|commercial_quotations/i.test(
        result.error.message || ""
      );
    if (unavailable) {
      const error = new Error("Commercial quotation migration is not deployed");
      error.status = 503;
      throw error;
    }
    throw result.error;
  }

  const quotationId = uuidOrNull(result.data?.quotation_id);
  return {
    ...(result.data || {}),
    success: true,
    quotation: quotationId
      ? await loadQuotation({ organizationId, entityId, quotationId })
      : null,
    idempotency_key: idempotencyKey,
  };
}

export async function transitionQuotation({
  access,
  body = {},
  organizationId,
  request,
}) {
  const entityId = requestedEntityId(body, request);
  const quotationId = uuidOrNull(
    body.quotationId || body.quotation_id || body.id
  );
  const action = String(body.action || "").trim().toUpperCase();
  const allowedActions = new Set([
    "SEND",
    "ACCEPT",
    "REJECT",
    "CANCEL",
    "EXPIRE",
    "CLOSE",
    "CONVERT",
  ]);

  if (!quotationId) {
    const error = new Error("quotation_id required");
    error.status = 400;
    throw error;
  }

  if (!allowedActions.has(action)) {
    const error = new Error("Unsupported quotation action");
    error.status = 400;
    throw error;
  }

  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) {
    const error = new Error(
      "Selected legal entity is outside the organization or inactive"
    );
    error.status = 403;
    throw error;
  }

  const actor = actorFrom(access);
  if (!actor.staffId) {
    const error = new Error("Authenticated staff identity is required");
    error.status = 403;
    throw error;
  }

  const idempotencyKey =
    text(body.idempotencyKey || body.idempotency_key) ||
    request?.headers?.get?.("idempotency-key") ||
    `quotation-${action.toLowerCase()}:${quotationId}:${crypto.randomUUID()}`;

  const result = await supabaseAdmin.rpc(
    "commercial_transition_quotation_atomic",
    {
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_quotation_id: quotationId,
      p_action: action,
      p_actor_id: actor.staffId,
      p_actor_name: actor.name,
      p_idempotency_key: idempotencyKey,
    }
  );

  if (result.error) {
    const message = result.error.message || "Unable to transition quotation";
    const error = new Error(message);
    error.status = /invalid|only|not found|required|expired|already/i.test(message)
      ? 409
      : 500;
    throw error;
  }

  return {
    ...(result.data || {}),
    success: true,
    quotation: await loadQuotation({ organizationId, entityId, quotationId }),
    idempotency_key: idempotencyKey,
  };
}

export default {
  createQuotation,
  listQuotations,
  transitionQuotation,
};
