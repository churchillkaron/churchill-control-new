import { execute } from "@/lib/ubte/runtime/ExecutionEngine";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  resolveBusinessContext,
} from "@/lib/business-context/resolveBusinessContext";

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function errorResponse(error, status = 500) {
  return Response.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId = readValue(
      body,
      "organizationId",
      "organization_id"
    );
    const requestedEntityId = readValue(
      body,
      "entityId",
      "entity_id"
    );
    const requestedPeriodId = readValue(
      body,
      "periodId",
      "period_id"
    );

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(
        access.error,
        access.status || 403
      );
    }

    const businessContext = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
      periodId: requestedPeriodId,
      request,
      access,
    });

    if (!businessContext.success) {
      return errorResponse(
        businessContext.error,
        businessContext.status || 400
      );
    }

    const actor = {
      id: access.user?.id || null,
      email: access.user?.email || null,
      staffAccountId:
        access.access?.staffAccountId ||
        access.staff?.id ||
        null,
      role: access.role || null,
    };
    const requestedPayload =
      body.payload && typeof body.payload === "object"
        ? body.payload
        : {};
    const canonicalPayload = {
      ...requestedPayload,
      organizationId: businessContext.organizationId,
      organization_id: businessContext.organizationId,
      entityId: businessContext.entityId,
      entity_id: businessContext.entityId,
      periodId: businessContext.periodId,
      period_id: businessContext.periodId,
      currency:
        businessContext.currency ||
        requestedPayload.currency ||
        null,
      currency_code:
        businessContext.currency ||
        requestedPayload.currency_code ||
        requestedPayload.currency ||
        null,
      authenticated_actor_id: actor.id,
    };

    const result = await execute({
      organizationId: businessContext.organizationId,
      domain: body.domain,
      capability: body.capability,
      action: body.action,
      payload: canonicalPayload,
      actor,
      runtime: {
        entityId: businessContext.entityId,
        periodId: businessContext.periodId,
        country: businessContext.country,
        currency: businessContext.currency,
        locale: businessContext.locale,
        timezone: businessContext.timezone,
        permissions: businessContext.permissions,
        workspace: body.workspace || null,
        metadata: {
          authenticated: true,
          staffAccountId: actor.staffAccountId,
          role: actor.role,
        },
      },
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(
      error?.message || "Capability execution failed",
      error?.status || 500
    );
  }
}
