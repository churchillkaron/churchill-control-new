import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  LiveProviderSessionRuntime,
} from "@/lib/platform/service-runtime/execution/LiveProviderSessionRuntime";

export const dynamic = "force-dynamic";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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
    const usageId = text(body.usageId || body.usage_id);
    const sessionId = text(body.sessionId || body.session_id);
    const action = text(body.action).toLowerCase() || "complete";

    if (!organizationId || !usageId || !sessionId) {
      return errorResponse(
        "Organization, usage and session are required",
        400,
      );
    }

    if (!["complete", "cancel"].includes(action)) {
      return errorResponse("Invalid settlement action", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
    }

    const result = action === "complete"
      ? await LiveProviderSessionRuntime.complete({
          organization_id: access.organizationId,
          provider: "openai",
          provider_request_id: sessionId,
          usage_id: usageId,
          metadata: {
            module: "OPERATOR",
            operation: "VOICE_REALTIME_TRANSCRIPTION_COMPLETE",
            channel: "voice",
            completion_evidence: "authenticated_client_session_event",
          },
        })
      : await LiveProviderSessionRuntime.cancel({
          organization_id: access.organizationId,
          provider: "openai",
          provider_request_id: sessionId,
          usage_id: usageId,
          reason: text(body.reason) || "VOICE_REALTIME_TRANSCRIPTION_CANCELLED",
          metadata: {
            module: "OPERATOR",
            operation: "VOICE_REALTIME_TRANSCRIPTION_CANCEL",
            channel: "voice",
          },
        });

    return Response.json(
      {
        success: true,
        action,
        usage_id: usageId,
        session_id: sessionId,
        already_completed: result?.already_completed === true,
        already_cancelled: result?.already_cancelled === true,
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    console.error(
      "OPERATOR_REALTIME_TRANSCRIPTION_SETTLEMENT_ERROR",
      error?.message || error,
    );

    return errorResponse(
      error?.message || "Realtime transcription settlement failed",
      error?.status || 500,
    );
  }
}
