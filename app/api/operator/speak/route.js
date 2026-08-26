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
import {
  requireOperatorVoiceLanguage,
} from "@/lib/operator/runtime/OperatorVoiceLanguagePolicy";
import {
  settleOperatorVoiceExecution,
} from "@/lib/operator/runtime/OperatorVoiceServiceSettlement";

export const maxDuration = 60;

const VOICE_LANGUAGE_COOKIE = "avantiqo_voice_language";

function text(value) {
  return String(value ?? "").trim();
}

function findAudioBase64(value, depth = 0) {
  if (depth > 8 || !value) return null;
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
    const requestedLanguage = text(
      body?.language || body?.requestedLanguage || body?.requested_language,
    ) || null;
    const explicitDetectedLanguage = text(
      body?.detectedLanguage || body?.detected_language,
    ) || null;
    const continuityLanguage = text(
      request.cookies?.get?.(VOICE_LANGUAGE_COOKIE)?.value,
    ) || null;
    const detectedLanguage = explicitDetectedLanguage || continuityLanguage;

    if (!speechText) {
      return errorResponse("Speech text required", 400);
    }

    if (!organizationId) {
      return errorResponse("Organization required", 400);
    }

    const voiceLanguage = requireOperatorVoiceLanguage({
      detectedLanguage,
      requestedLanguage,
      locale,
    });
    const continuityUsed =
      !explicitDetectedLanguage &&
      Boolean(continuityLanguage) &&
      voiceLanguage.language_source === "detected";

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
        locale: voiceLanguage.language,
        language: voiceLanguage.language,
      },
      metadata: {
        module: "OPERATOR",
        operation: "VOICE_RESPONSE",
        channel: "voice",
        voice_language_contract: voiceLanguage.contract,
        voice_language: voiceLanguage.language,
        voice_language_source: continuityUsed
          ? "detected_continuity"
          : voiceLanguage.language_source,
        voice_language_continuity_used: continuityUsed,
        voice_quality: voiceLanguage.voice_quality,
        low_quality_fallback_allowed: false,
      },
      category: "AI",
    });

    const settledExecution = await settleOperatorVoiceExecution({
      execution,
      organizationId: businessContext.organizationId,
      capability: "ai.text.to.speech",
      metadata: {
        module: "OPERATOR",
        operation: "VOICE_RESPONSE",
        channel: "voice",
      },
    });

    const audioBase64 = findAudioBase64(settledExecution);
    if (!audioBase64) {
      console.error("OPERATOR_SPEECH_NO_AUDIO", {
        duration_ms: Date.now() - startedAt,
        language: voiceLanguage.language,
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
      language: voiceLanguage.language,
      language_source: continuityUsed
        ? "detected_continuity"
        : voiceLanguage.language_source,
      voice_language_continuity_used: continuityUsed,
      usage_id: settledExecution?.usage?.id || execution?.usage?.id || null,
    });

    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(audio.length),
        "Cache-Control": "no-store",
        "X-Avantiqo-Voice": "governed",
        "X-Avantiqo-Voice-Language": voiceLanguage.language,
        "X-Avantiqo-Voice-Language-Source": continuityUsed
          ? "detected-continuity"
          : voiceLanguage.language_source,
        "X-Avantiqo-Voice-Quality": voiceLanguage.voice_quality,
      },
    });
  } catch (error) {
    console.error("OPERATOR_SPEECH_ERROR", error);

    return errorResponse(
      error?.message || "Voice response failed",
      error?.status || 500,
      error?.voice_plan
        ? {
            language: error.voice_plan.language,
            reply_language: error.voice_plan.reply_language,
            voice_available: error.voice_plan.voice_available,
            voice_quality: error.voice_plan.voice_quality,
            low_quality_fallback_allowed:
              error.voice_plan.low_quality_fallback_allowed,
          }
        : null,
    );
  }
}
