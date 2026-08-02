import {
  createSalesOrderDraft,
  listSalesOrders,
} from "@/lib/commercial/sales/SalesOrderService";

function readEntityId(source = {}) {
  return (
    source.entityId ||
    source.entity_id ||
    source.legalEntityId ||
    source.legal_entity_id ||
    null
  );
}

function entityIdFromRequest(request) {
  try {
    const searchParams = new URL(request?.url || "http://localhost").searchParams;
    return (
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      searchParams.get("legalEntityId") ||
      searchParams.get("legal_entity_id") ||
      null
    );
  } catch {
    return null;
  }
}

async function createOrder({ access, body, organizationId, request }) {
  return createSalesOrderDraft({
    access,
    body: {
      ...body,
      applicationId: "retail",
      channel: body.channel || "POS",
      sourceType: body.sourceType || body.source_type || "point_of_sale",
    },
    organizationId,
    request,
  });
}

async function listOrders({ access, organizationId, request }) {
  const entityId =
    entityIdFromRequest(request) ||
    readEntityId(access) ||
    readEntityId(access?.access || {});

  return listSalesOrders({
    organizationId,
    entityId,
  });
}

const RetailPOSAdapter = Object.freeze({
  id: "retail",
  contextSchema: Object.freeze({
    type: "sale",
    requiresContext: false,
    requiresItemSeat: false,
  }),
  createOrder,
  listOrders,
});

export default RetailPOSAdapter;
