import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  resolveBusinessContext,
} from "@/lib/business-context/resolveBusinessContext";
import {
  execute as executeUbteCapability,
} from "@/lib/ubte/runtime/ExecutionEngine";

function text(value) {
  return String(value ?? "").trim();
}

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function errorResponse(error, status = 500, details = null) {
  return Response.json(
    {
      success: false,
      error,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

async function resolvePartyAccess(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
  });

  if (!access.success) {
    return {
      error: errorResponse(access.error, access.status || 403),
    };
  }

  const partyId =
    access.staff?.party_id ||
    access.staff?.partyId ||
    null;

  if (!partyId) {
    return {
      error: errorResponse(
        "Authenticated staff account is not linked to a party",
        409,
      ),
    };
  }

  return { access, partyId };
}

export async function POST(request) {
  const startedAt = Date.now();

  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = readValue(
      body,
      "organizationId",
      "organization_id",
    );
    const requestedEntityId = readValue(
      body,
      "entityId",
      "entity_id",
    );
    const requestedPeriodId = readValue(
      body,
      "periodId",
      "period_id",
    );

    const resolved = await resolvePartyAccess(request, organizationId);
    if (resolved.error) return resolved.error;

    const { access, partyId } = resolved;
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
        businessContext.status || 400,
      );
    }

    const actor = {
      id: access.user?.id || null,
      email: access.user?.email || null,
      partyId,
      party_id: partyId,
      staffAccountId:
        access.access?.staffAccountId ||
        access.staff?.id ||
        null,
      role: access.role || null,
    };

    const execution = await executeUbteCapability({
      organizationId: businessContext.organizationId,
      domain: "platform",
      capability: "attention",
      action: "scan",
      payload: {
        force_refresh:
          body.forceRefresh === true ||
          body.force_refresh === true,
      },
      actor,
      runtime: {
        entityId: businessContext.entityId,
        periodId: businessContext.periodId,
        country: businessContext.country || null,
        permissions:
          businessContext.permissions ||
          access.permissions ||
          [],
        installedModules: businessContext.installedModules || [],
        featureFlags: businessContext.featureFlags || {},
        locale: businessContext.locale || null,
        currency: businessContext.currency || null,
        timezone: businessContext.timezone || null,
        callerRequest: request,
        metadata: {
          source: "AVANTIQO_OPERATOR",
          channel: "attention",
          partyId,
        },
      },
    });

    const attention = execution?.result || {};
    const totalMs = Date.now() - startedAt;

    console.info(
      "OPERATOR_ATTENTION_LATENCY_V1",
      JSON.stringify({
        organization_id: businessContext.organizationId,
        entity_scoped: Boolean(businessContext.entityId),
        status: text(attention.status) || null,
        item_count: Array.isArray(attention.items) ? attention.items.length : 0,
        cache_hit: attention.cache_hit === true,
        total_ms: totalMs,
      }),
    );

    const response = Response.json({
      success: true,
      attention,
      context: {
        organization_id: businessContext.organizationId,
        entity_id: businessContext.entityId,
        period_id: businessContext.periodId,
        party_id: partyId,
        locale: businessContext.locale || null,
        timezone: businessContext.timezone || null,
      },
    });

    response.headers.set(
      "Server-Timing",
      `attention;dur=${totalMs}`,
    );

    return response;
  } catch (error) {
    console.error("OPERATOR_ATTENTION_ERROR", error);
    return errorResponse(
      error?.message || "Avantiqo attention scan failed",
      error?.status || 500,
    );
  }
}
