export const dynamic = "force-dynamic";

import resolvePOSRequestApplication from "@/lib/operations/commerce/server/resolvePOSRequestApplication";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveStaffPortalEffectivePermissions } from "@/lib/people/portal/StaffPortalPermissionRuntime";
import { assertRestaurantFulfillmentAccess } from "@/lib/operations/commerce/security/RestaurantFulfillmentAccessPolicy";

function errorResponse(error, status = 500) {
  return Response.json({ success: false, error }, { status });
}

async function effectiveFulfillmentAccess(access, organizationId) {
  const resolved = await resolveStaffPortalEffectivePermissions({
    organizationId,
    userId: access?.userId || access?.user?.id || access?.access?.userId || null,
    role: access?.role || access?.staff?.role || access?.access?.role || null,
    basePermissions: access?.permissions || access?.access?.permissions || [],
  });
  return { ...access, permissions: resolved.permissions };
}

function requestEntityId(request, body = null) {
  if (body) {
    return (
      body.entityId ||
      body.entity_id ||
      body.legalEntityId ||
      body.legal_entity_id ||
      request.headers.get("x-entity-id") ||
      null
    );
  }

  const { searchParams } = new URL(request.url);
  return (
    searchParams.get("entityId") ||
    searchParams.get("entity_id") ||
    searchParams.get("legalEntityId") ||
    searchParams.get("legal_entity_id") ||
    request.headers.get("x-entity-id") ||
    null
  );
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
    }

    const resolved = await resolvePOSRequestApplication({
      request,
      organizationId: access.organizationId,
      requestedApplicationId:
        searchParams.get("applicationId") ||
        request.headers.get("x-pos-application"),
    });

    if (!resolved.success) {
      return errorResponse(resolved.error, resolved.status);
    }

    const fulfillmentAccess = await effectiveFulfillmentAccess(
      resolved.access,
      resolved.organizationId,
    );
    const allowedSourceTypes = assertRestaurantFulfillmentAccess({
      access: fulfillmentAccess,
    });

    const fulfillment = resolved.application.adapter?.fulfillment;
    if (typeof fulfillment?.listQueue !== "function") {
      return errorResponse(
        `Fulfillment queues are not available for application ${resolved.application.id}`,
        501
      );
    }

    const result = await fulfillment.listQueue({
      access: fulfillmentAccess,
      application: resolved.application,
      organization: resolved.organization,
      organizationId: resolved.organizationId,
      entityId: requestEntityId(request),
      scope: searchParams.get("scope") || "active",
      allowedSourceTypes,
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("FULFILLMENT QUEUE ERROR", error);
    return errorResponse(
      error?.message || "Unable to load fulfillment queue",
      error?.status || 500
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const resolved = await resolvePOSRequestApplication({
      request,
      organizationId: body.organizationId || body.organization_id,
      requestedApplicationId:
        body.applicationId ||
        body.application_id ||
        request.headers.get("x-pos-application"),
    });

    if (!resolved.success) {
      return errorResponse(resolved.error, resolved.status);
    }

    const fulfillmentAccess = await effectiveFulfillmentAccess(
      resolved.access,
      resolved.organizationId,
    );
    const sourceType = String(
      body.sourceType || body.source_type || body.ticketType || body.ticket_type || body.source?.type || "",
    ).trim().toLowerCase();
    if (!sourceType) return errorResponse("Fulfillment sourceType required", 400);
    assertRestaurantFulfillmentAccess({ access: fulfillmentAccess, sourceType });

    const fulfillment = resolved.application.adapter?.fulfillment;
    if (typeof fulfillment?.transitionWorkItem !== "function") {
      return errorResponse(
        `Fulfillment transitions are not available for application ${resolved.application.id}`,
        501
      );
    }

    const result = await fulfillment.transitionWorkItem({
      body,
      access: fulfillmentAccess,
      application: resolved.application,
      organization: resolved.organization,
      organizationId: resolved.organizationId,
      entityId: requestEntityId(request, body),
      request,
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("FULFILLMENT TRANSITION ERROR", error);
    return errorResponse(
      error?.message || "Fulfillment transition failed",
      error?.status || 500
    );
  }
}
