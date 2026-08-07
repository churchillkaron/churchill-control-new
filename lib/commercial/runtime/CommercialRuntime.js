import { CrmRuntime } from "@/lib/commercial/crm/runtime/CrmRuntime";
import { MarketingRuntime } from "@/lib/marketing/runtime/MarketingRuntime";

const SALES_ORDERS_API = "/api/commercial/sales/orders";

function text(value) {
  return String(value ?? "").trim();
}

function organizationIdFor(payload = {}, context = {}) {
  return text(
    context.organizationId ||
      context.organization_id ||
      payload.organizationId ||
      payload.organization_id
  );
}

function entityIdFor(payload = {}, context = {}) {
  return text(
    context.entityId ||
      context.entity_id ||
      payload.entityId ||
      payload.entity_id ||
      payload.legalEntityId ||
      payload.legal_entity_id
  );
}

async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (response.ok) return body;

  const error = new Error(
    body?.error ||
      body?.message ||
      `Commercial sales request failed with status ${response.status}`
  );
  error.status = response.status;
  error.payload = body;
  throw error;
}

async function executeSalesApi(event = {}) {
  if (typeof window === "undefined") {
    throw new Error(
      "COMMERCIAL_SALES_RUNTIME_SERVER_API_REQUIRED: use the commercial sales API route or SalesOrderService from server-only code"
    );
  }

  const { type, payload = {}, context = {} } = event || {};
  const organizationId = organizationIdFor(payload, context);
  const entityId = entityIdFor(payload, context);

  if (!type) {
    throw new Error("sales event type required");
  }
  if (!organizationId) {
    throw new Error("organization_id required");
  }

  switch (type) {
    case "CREATE_SALES_ORDER": {
      const response = await fetch(SALES_ORDERS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          organization_id: organizationId,
          entity_id: entityId || null,
        }),
      });
      return responseJson(response);
    }

    case "LIST_SALES_ORDERS": {
      const params = new URLSearchParams({
        organization_id: organizationId,
      });
      if (entityId) params.set("entity_id", entityId);
      if (payload.limit !== undefined && payload.limit !== null) {
        params.set("limit", String(payload.limit));
      }
      const response = await fetch(`${SALES_ORDERS_API}?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      return responseJson(response);
    }

    case "CONFIRM_SALES_ORDER": {
      const response = await fetch(SALES_ORDERS_API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          action: "CONFIRM",
          organization_id: organizationId,
          entity_id: entityId || null,
        }),
      });
      return responseJson(response);
    }

    default:
      throw new Error(`Unknown or server-only sales event type: ${type}`);
  }
}

export function buildCommercialRuntime(context = {}) {
  return Object.freeze({
    domain: "commercial",
    client_safe: true,
    server_execution_boundary: "COMMERCIAL_SALES_API",
    crm: CrmRuntime,
    sales: Object.freeze({
      endpoint: SALES_ORDERS_API,
      execute: executeSalesApi,
    }),
    marketing: MarketingRuntime,
    context: Object.freeze({ ...context }),
  });
}

export default buildCommercialRuntime;
