import "@/lib/finance/bootstrap/registerFinanceBilling";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  resolveBusinessContext,
} from "@/lib/business-context/resolveBusinessContext";
import {
  requireOperatorVoiceLanguage,
} from "@/lib/operator/runtime/OperatorVoiceLanguagePolicy";
import {
  OperatorVoiceAsyncSpeechRuntime,
} from "@/lib/operator/runtime/OperatorVoiceAsyncSpeechRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VOICE_LANGUAGE_COOKIE = "avantiqo_voice_language";

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
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function organizationAccess(request, organizationId) {
  if (!organizationId) return { success: false, error: "Organization required", status: 400 };
  return requireOrganizationAccess({ organizationId, request });
}

function audioResponse(audio, language, jobId) {
  return new Response(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(audio.length),
      "Cache-Control": "no-store",
      "X-Avantiqo-Voice": "governed-async",
      "X-Avantiqo-Voice-Job": jobId,
      ...(language ? { "X-Avantiqo-Voice-Language": language } : {}),
    },
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const speechText = text(body?.text || body?.message);
    const organizationId = text(body?.organizationId || body?.organization_id);
    const requestedEntityId = text(body?.entityId || body?.entity_id) || null;
    const voiceLibraryProfileId = text(
      body?.voiceLibraryProfileId ||
      body?.voice_library_profile_id ||
      body?.voiceIdentityProfileId ||
      body?.voice_identity_profile_id,
    ) || null;
    const deliveryProfile = text(
      body?.deliveryProfile || body?.delivery_profile || body?.voiceProfile || body?.voice_profile,
    ) || null;
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

    if (!speechText) return errorResponse("Speech text required", 400);

    const access = await organizationAccess(request, organizationId);
    if (!access.success) return errorResponse(access.error, access.status || 403);

    const partyId = access.staff?.party_id || access.staff?.partyId || null;
    if (!partyId) {
      return errorResponse("Authenticated staff account is not linked to a party", 409);
    }

    const businessContext = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
      request,
      access,
    });
    if (!businessContext.success) {
      return errorResponse(businessContext.error, businessContext.status || 400);
    }

    const voiceLanguage = requireOperatorVoiceLanguage({
      detectedLanguage: explicitDetectedLanguage || continuityLanguage,
      requestedLanguage,
      locale,
    });
    const words = speechText.split(/\s+/).filter(Boolean).length;
    const estimatedMinutes = Math.max(0.02, Math.min(10, words / 150));

    const result = await OperatorVoiceAsyncSpeechRuntime.start({
      organizationId: businessContext.organizationId,
      entityId: businessContext.entityId,
      partyId,
      speechText,
      language: voiceLanguage.language,
      locale,
      voiceLibraryProfileId,
      deliveryProfile,
      quantity: estimatedMinutes,
      metadata: {
        voice_language_contract: voiceLanguage.contract,
        voice_language: voiceLanguage.language,
        voice_language_source: voiceLanguage.language_source,
        voice_quality: voiceLanguage.voice_quality,
        low_quality_fallback_allowed: false,
      },
    });

    if (!result.pending && result.audio) {
      return audioResponse(result.audio, voiceLanguage.language, result.job_id);
    }

    return Response.json(
      {
        success: true,
        pending: true,
        contract: result.contract,
        job_id: result.job_id,
        status: "PENDING",
        provider_status: result.provider_status || null,
        expires_at: result.expires_at || null,
        language: voiceLanguage.language,
      },
      {
        status: 202,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "2",
        },
      },
    );
  } catch (error) {
    return errorResponse(
      error?.message || "Voice response start failed",
      error?.status || 500,
      error?.voice_plan
        ? {
            language: error.voice_plan.language,
            voice_available: error.voice_plan.voice_available,
            voice_quality: error.voice_plan.voice_quality,
          }
        : null,
    );
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );
    const jobId = text(url.searchParams.get("jobId") || url.searchParams.get("job_id"));
    if (!jobId) return errorResponse("Voice job required", 400);

    const access = await organizationAccess(request, organizationId);
    if (!access.success) return errorResponse(access.error, access.status || 403);

    const result = await OperatorVoiceAsyncSpeechRuntime.poll({
      jobId,
      organizationId: access.organizationId,
    });

    if (result.audio) {
      return audioResponse(result.audio, null, result.job_id);
    }

    return Response.json(result, {
      status: result.pending ? 202 : result.success ? 200 : 502,
      headers: {
        "Cache-Control": "no-store",
        ...(result.pending ? { "Retry-After": "2" } : {}),
      },
    });
  } catch (error) {
    const message = error?.message || "Voice response status failed";
    return errorResponse(
      message,
      message.includes("NOT_FOUND") ? 404 : error?.status || 500,
    );
  }
}

export async function DELETE(request) {
  try {
    const url = new URL(request.url);
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const organizationId = text(
      body?.organizationId ||
      body?.organization_id ||
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
    );
    const jobId = text(
      body?.jobId ||
      body?.job_id ||
      url.searchParams.get("jobId") ||
      url.searchParams.get("job_id"),
    );
    const reason = text(body?.reason || url.searchParams.get("reason")) || null;
    if (!jobId) return errorResponse("Voice job required", 400);

    const access = await organizationAccess(request, organizationId);
    if (!access.success) return errorResponse(access.error, access.status || 403);

    const result = await OperatorVoiceAsyncSpeechRuntime.cancel({
      jobId,
      organizationId: access.organizationId,
      reason,
    });

    return Response.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error?.message || "Voice response cancellation failed";
    return errorResponse(
      message,
      message.includes("NOT_FOUND") ? 404 : error?.status || 500,
    );
  }
}
