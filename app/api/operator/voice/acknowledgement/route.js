import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  generateOperatorVoiceAcknowledgement,
} from "@/lib/operator/runtime/OperatorVoiceAcknowledgementRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function errorResponse(error, status = 500) {
  return Response.json(
    {
      success: false,
      error,
    },
    { status },
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = readValue(
      body,
      "organizationId",
      "organization_id",
    );
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

    const result = await generateOperatorVoiceAcknowledgement({
      organizationId: access.organizationId,
      partyId,
      locale: text(body.locale) || null,
      organizationName:
        text(body.organizationName) ||
        text(body.organization_name) ||
        null,
      previousAcknowledgement:
        text(body.previousAcknowledgement) ||
        text(body.previous_acknowledgement) ||
        null,
    });

    return Response.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("OPERATOR_VOICE_ACKNOWLEDGEMENT_ERROR", error);
    return errorResponse(
      error?.message || "Avantiqo voice acknowledgement failed",
      error?.status || 500,
    );
  }
}
