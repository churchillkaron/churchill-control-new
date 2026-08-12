import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  resolveBusinessContext,
} from "@/lib/business-context/resolveBusinessContext";
import {
  runOperatorTurn,
} from "@/lib/operator/runtime/OperatorTurnRuntime";

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function text(value) {
  return String(value ?? "").trim();
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

function boundedConversation(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-12)
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: text(message?.content).slice(0, 6000),
    }))
    .filter((message) => message.content);
}

export async function POST(request) {
  try {
    const body = await request.json();
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
    const message = text(body.message);

    if (!message) {
      return errorResponse("Message required", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(
        access.error,
        access.status || 403,
      );
    }

    const partyId =
      access.staff?.party_id ||
      access.staff?.partyId ||
      null;

    if (!partyId) {
      return errorResponse(
        "Authenticated staff account is not linked to a party",
        409,
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

    const result = await runOperatorTurn({
      organizationId: businessContext.organizationId,
      entityId: businessContext.entityId,
      periodId: businessContext.periodId,
      partyId,
      actor,
      role: access.role,
      permissions:
        businessContext.permissions ||
        access.permissions ||
        [],
      locale:
        text(body.locale) ||
        businessContext.locale ||
        null,
      timezone: businessContext.timezone || null,
      message,
      source: text(body.source) || "text",
      pathname: text(body.pathname) || null,
      agreementState:
        body.agreementState && typeof body.agreementState === "object"
          ? body.agreementState
          : body.agreement_state && typeof body.agreement_state === "object"
            ? body.agreement_state
            : {},
      conversation: boundedConversation(body.conversation),
    });

    return Response.json({
      ...result,
      context: {
        organization_id: businessContext.organizationId,
        entity_id: businessContext.entityId,
        period_id: businessContext.periodId,
        party_id: partyId,
        locale: businessContext.locale || null,
        timezone: businessContext.timezone || null,
      },
    });
  } catch (error) {
    console.error("OPERATOR_TURN_ERROR", error);

    return errorResponse(
      error?.message || "Avantiqo Operator failed",
      error?.status || 500,
    );
  }
}
