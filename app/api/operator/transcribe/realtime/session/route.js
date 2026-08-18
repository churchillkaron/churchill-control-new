import "@/lib/finance/bootstrap/registerFinanceBilling";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  resolveBusinessContext,
} from "@/lib/business-context/resolveBusinessContext";
import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

export const dynamic = "force-dynamic";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function findValue(value, keys, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return null;
  if (typeof value !== "object") return null;

  for (const key of keys) {
    const direct = value[key];
    if (direct !== undefined && direct !== null && direct !== "") {
      return direct;
    }
  }

  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findValue(value[key], keys, depth + 1);
    if (found !== null) return found;
  }

  return null;
}

function errorResponse(error, status = 500) {
  return Response.json(
    { success: false, error },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request) {
  try {
    const body = object(await request.json());
    const organizationId = text(
      body.organizationId || body.organization_id,
    );
    const requestedEntityId = text(
      body.entityId || body.entity_id,
    ) || null;
    const locale = text(body.locale) || null;

    if (!organizationId) {
      return errorResponse("Organization required", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
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
      request,
      access,
    });

    if (!businessContext.success) {
      return errorResponse(
        businessContext.error,
        businessContext.status || 400,
      );
    }

    const execution = await ServiceExecutionRuntime.execute({
      organization_id: businessContext.organizationId,
      party_id: partyId,
      entity_id: businessContext.entityId,
      service_id: "ai.speech.to.text",
      capability: "ai.speech.to.text.realtime",
      input: {
        quantity: 1,
        language: locale ? locale.split("-")[0] : undefined,
        session_ttl_seconds: 45,
      },
      metadata: {
        module: "OPERATOR",
        operation: "VOICE_REALTIME_TRANSCRIPTION_SESSION",
        channel: "voice",
        latency_class: "realtime",
        ephemeral_credential: true,
      },
      category: "AI",
    });

    if (!execution?.pending) {
      throw new Error("REALTIME_TRANSCRIPTION_SESSION_NOT_PENDING");
    }

    const clientSecret = text(
      findValue(execution, ["client_secret"]),
    );
    const sessionId = text(
      execution.provider_job_id ||
      findValue(execution, ["session_id", "provider_job_id"]),
    );
    const websocketUrl = text(
      findValue(execution, ["websocket_url"]),
    );
    const expiresAt = findValue(execution, ["expires_at"]);
    const usageId = text(execution?.usage?.id);

    if (!clientSecret || !sessionId || !usageId || !websocketUrl) {
      throw new Error("REALTIME_TRANSCRIPTION_SESSION_INCOMPLETE");
    }

    return Response.json(
      {
        success: true,
        provider: execution.provider,
        model: execution.model,
        usage_id: usageId,
        session_id: sessionId,
        client_secret: clientSecret,
        expires_at: expiresAt || null,
        websocket_url: websocketUrl,
        intent: "transcription",
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    console.error(
      "OPERATOR_REALTIME_TRANSCRIPTION_SESSION_ERROR",
      error?.message || error,
    );

    return errorResponse(
      error?.message || "Realtime transcription session failed",
      error?.status || 500,
    );
  }
}
