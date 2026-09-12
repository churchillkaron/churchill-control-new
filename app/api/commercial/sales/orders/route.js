export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  createSalesOrderDraft,
  listSalesOrders,
} from "@/lib/commercial/sales/SalesOrderService";
import { confirmSalesOrder } from "@/lib/commercial/sales/ConfirmSalesOrderService";
import { fulfillAndInvoiceSalesOrder } from "@/lib/commercial/sales/FulfillAndInvoiceSalesOrderService";
import { projectCommercialMarketingOutcome } from "@/lib/commercial/marketing/projectCommercialMarketingOutcome";

function value(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function errorResponse(error, status = 500) {
  const message = typeof error === "string" ? error : error?.message || String(error || "Request failed");
  const actionIdentityEvidence = Array.isArray(error?.action_identity_evidence) ? error.action_identity_evidence : [];
  return Response.json({ success: false, error: message, ...(actionIdentityEvidence.length ? { action_identity_evidence: actionIdentityEvidence } : {}) }, { status });
}

async function accessForBody(request, body) {
  const organizationId = value(body, "organizationId", "organization_id");
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) {
    return {
      response: errorResponse(access.error, access.status || 403),
      access: null,
    };
  }
  return { response: null, access };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId =
      searchParams.get("organizationId") || searchParams.get("organization_id");
    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      searchParams.get("legalEntityId") ||
      searchParams.get("legal_entity_id");
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status || 403);

    const salesOrderId = searchParams.get("sales_order_id") || searchParams.get("id");
    const idempotencyKey = searchParams.get("idempotency_key");
    const exactLookup = Boolean(salesOrderId || idempotencyKey);
    const orders = await listSalesOrders({
      organizationId: access.organizationId,
      entityId,
      limit: searchParams.get("limit"),
      salesOrderId,
      idempotencyKey,
    });
    return Response.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entityId,
      orders,
      ...(exactLookup ? {
        business_effect_outcome: {
          contract: "AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1",
          state: orders.length ? "COMPLETED" : "NOT_COMPLETED",
          authoritative_server_evidence: true,
          exact_business_scope_matched: true,
          business_effect_observed: orders.length > 0,
          business_effect_absent: orders.length === 0,
          safe_to_retry: orders.length === 0,
          matched_identity: orders.length ? `sales_order_id:${orders[0].id}` : null,
          derivation: idempotencyKey ? "COMMERCIAL_SALES_ORDER_IDEMPOTENCY_REINSPECTION" : "COMMERCIAL_SALES_ORDER_EXACT_ID_REINSPECTION",
        },
      } : {}),
    });
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to load sales orders",
      error?.status || 500
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const resolved = await accessForBody(request, body);
    if (resolved.response) return resolved.response;
    const result = await createSalesOrderDraft({
      access: resolved.access,
      body,
      organizationId: resolved.access.organizationId,
      request,
    });

    const marketing_outcome = await projectCommercialMarketingOutcome({
      organizationId: resolved.access.organizationId,
      body,
      result,
      documentType: "SALES_ORDER",
      outcomeType: "ORDER_CREATED",
      qualified: false,
      revenue: 0,
      metadata: { commercial_stage: "SALES_ORDER_CREATED" },
    });

    return Response.json(
      { ...result, marketing_outcome },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    return errorResponse(
      error,
      error?.status || 500
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const action = String(body.action || "CONFIRM").trim().toUpperCase();
    const resolved = await accessForBody(request, body);
    if (resolved.response) return resolved.response;

    if (action === "CONFIRM") {
      const result = await confirmSalesOrder({
        access: resolved.access,
        body,
        organizationId: resolved.access.organizationId,
        request,
      });
      const marketing_outcome = await projectCommercialMarketingOutcome({
        organizationId: resolved.access.organizationId,
        body,
        result,
        documentType: "SALES_ORDER",
        outcomeType: "SALE",
        qualified: true,
        revenue: 0,
        metadata: { commercial_stage: "SALES_ORDER_CONFIRMED" },
      });
      return Response.json({ ...result, marketing_outcome });
    }

    if (action === "FULFILL" || action === "FULFILL_AND_INVOICE") {
      const result = await fulfillAndInvoiceSalesOrder({
        access: resolved.access,
        body,
        organizationId: resolved.access.organizationId,
        request,
      });
      const marketing_outcome = await projectCommercialMarketingOutcome({
        organizationId: resolved.access.organizationId,
        body,
        result,
        documentType: "SALES_ORDER",
        outcomeType: "FULFILLED_ORDER",
        qualified: true,
        revenue: 0,
        metadata: { commercial_stage: "SALES_ORDER_FULFILLED" },
      });

      const fulfillmentCost = Number(result.finance?.amount || 0);
      const marketing_cost_outcome = fulfillmentCost > 0
        ? await projectCommercialMarketingOutcome({
            organizationId: resolved.access.organizationId,
            body,
            result,
            documentType: "SALES_ORDER",
            outcomeType: "FULFILLMENT_COGS",
            qualified: false,
            quantity: 0,
            revenue: 0,
            cost: fulfillmentCost,
            profit: -fulfillmentCost,
            currency: result.finance?.currency_code || null,
            metadata: {
              commercial_stage: "SALES_ORDER_FULFILLMENT_COGS",
              finance_cost_source: "INVENTORY_CONSUMPTION",
              fulfillment_cost: fulfillmentCost,
            },
          })
        : {
            projected: false,
            reason: result.finance?.reason || "NO_INVENTORY_COST",
          };

      return Response.json({
        ...result,
        marketing_outcome,
        marketing_cost_outcome,
      });
    }

    return errorResponse("Unsupported sales order action", 400);
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to update sales order",
      error?.status || 500
    );
  }
}
