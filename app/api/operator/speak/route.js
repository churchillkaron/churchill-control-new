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

function text(value) {
  return String(value ?? "").trim();
}

function findAudioBase64(value, depth = 0) {
  if (depth > 6 || !value) return null;
  if (typeof value !== "object") return null;

  if (typeof value.audio_base64 === "string" && value.audio_base64.trim()) {
    return value.audio_base64.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioBase64(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findAudioBase64(value[key], depth + 1);
    if (found) return found;
  }

  return null;
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
  const startedAt = Date.now();

  try {
    const body = await request.json();
    const speechText = text(body?.text || body?.message);
    const organizationId = text(
      body?.organizationId || body?.organization_id,
    );
    const requestedEntityId = text(
      body?.entityId || body?.entity_id,
    ) || null;
    const voice = text(body?.voice) || null;
    const locale = text(body?.locale) || null;

    if (!speechText) {
      return errorResponse("Speech text required", 400);
    }

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

    const words = speechText.split(/\s+/).filter(Boolean).length;
    const estimatedMinutes = Math.max(0.02, Math.min(10, words / 150));

    const execution = await ServiceExecutionRuntime.execute({
      organization_id: businessContext.organizationId,
      party_id: partyId,
      entity_id: businessContext.entityId,
      service_id: "ai.text.to.speech",
      input: {
        input: speechText,
        voice: voice || undefined,
        response_format: "wav",
        quantity: estimatedMinutes,
        locale: locale || undefined,
      },
      metadata: {
        module: "OPERATOR",
        operation: "VOICE_RESPONSE",
        channel: "voice",
      },
      category: "AI",
    });

    const audioBase64 = findAudioBase64(execution);
    if (!audioBase64) {
      console.error("OPERATOR_SPEECH_NO_AUDIO", {
        duration_ms: Date.now() - startedAt,
      });
      return errorResponse("Speech generation returned no audio", 502);
    }

    const audio = Buffer.from(audioBase64, "base64");
    if (!audio.length) {
      return errorResponse("Speech generation returned empty audio", 502);
    }

    console.log("OPERATOR_SPEECH_COMPLETE", {
      duration_ms: Date.now() - startedAt,
      bytes: audio.length,
      format: "wav",
    });

    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(audio.length),
        "Cache-Control": "no-store",
        "X-Avantiqo-Voice": "governed",
      },
    });
  } catch (error) {
    console.error("OPERATOR_SPEECH_ERROR", error);

    return errorResponse(
      error?.message || "Voice response failed",
      error?.status || 500,
    );
  }
}
