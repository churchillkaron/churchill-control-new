export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  createSalesOrderDraft,
  listSalesOrders,
} from "@/lib/commercial/sales/SalesOrderService";
import { confirmSalesOrder } from "@/lib/commercial/sales/ConfirmSalesOrderService";
import { fulfillAndInvoiceSalesOrder } from "@/lib/commercial/sales/FulfillAndInvoiceSalesOrderService";

function value(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function errorResponse(error, status = 500) {
  return Response.json({ success: false, error }, { status });
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

    const orders = await listSalesOrders({
      organizationId: access.organizationId,
      entityId,
      limit: searchParams.get("limit"),
    });
    return Response.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entityId,
      orders,
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
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to create sales order draft",
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
      return Response.json(result);
    }

    if (action === "FULFILL" || action === "FULFILL_AND_INVOICE") {
      const result = await fulfillAndInvoiceSalesOrder({
        access: resolved.access,
        body,
        organizationId: resolved.access.organizationId,
        request,
      });
      return Response.json(result);
    }

    return errorResponse("Unsupported sales order action", 400);
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to update sales order",
      error?.status || 500
    );
  }
}
