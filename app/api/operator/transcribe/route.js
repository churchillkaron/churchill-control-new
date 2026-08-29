import "@/lib/finance/bootstrap/registerFinanceBilling";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  resolveBusinessContext,
} from "@/lib/business-context/resolveBusinessContext";
import {
  listOperatorNavigationTargets,
} from "@/lib/operator/runtime/OperatorNavigationCatalog";
import {
  cancelOperatorAsyncTranscription,
  pollOperatorAsyncTranscription,
  startOperatorAsyncTranscription,
} from "@/lib/operator/runtime/OperatorVoiceAsyncTranscriptionRuntime";

export const runtime = "nodejs";
export const maxDuration = 60;

const VOICE_LANGUAGE_COOKIE = "avantiqo_voice_language";
const VOICE_LANGUAGE_COOKIE_MAX_AGE_SECONDS = 300;

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wakeDetected(value) {
  const candidate = normalized(value);
  if (!candidate) return false;
  const compact = candidate.replace(/\s+/g, "");
  const hasName = ["avantiqo", "avantiq", "avantico", "avantigo", "avantiko", "avantiquo", "avanti"]
    .some((name) => compact.includes(name));
  if (!hasName) return false;
  const words = candidate.split(" ").filter(Boolean);
  const hasGreeting = words.some((word) => ["hey", "hay", "hei", "hi", "hello"].includes(word));
  return hasGreeting || words.length <= 4;
}

function commandVocabulary(organizationId) {
  const targets = listOperatorNavigationTargets({ organizationId });
  const labels = [];
  const seen = new Set();
  for (const target of targets) {
    for (const candidate of [target?.name, target?.domain_id, target?.group_name]) {
      const clean = text(candidate);
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      labels.push(clean);
      if (labels.length >= 120) break;
    }
    if (labels.length >= 120) break;
  }
  return labels.join(", ").slice(0, 2800);
}

function commandPrompt(organizationId) {
  const vocabulary = commandVocabulary(organizationId);
  if (!vocabulary) return undefined;
  return [
    "This is a spoken command to the Avantiqo business operating system.",
    "Preserve navigation phrases such as open, go to, take me to, show me, and navigate to.",
    "When the speaker names a registered Avantiqo destination and the audio is acoustically close, preserve that registered destination name exactly instead of substituting a similar everyday phrase.",
    `Registered Avantiqo destinations: ${vocabulary}.`,
  ].join(" ");
}

function wakePrompt() {
  return [
    "This is wake-word detection for the assistant Avantiqo.",
    "Avantiqo is spelled A-v-a-n-t-i-q-o.",
    "The speaker can have any accent or language background.",
    "Listen especially for pronunciations or transcriptions resembling Avantiqo, Avanti Q, Avanti Q O, Avanti Go, Avantico, Avantiko, Avanti Quo, or Avanti.",
    "If that name is spoken, preserve it as Avantiqo in the transcript and preserve any words spoken immediately after it.",
  ].join(" ");
}

function errorResponse(error, status = 500) {
  return Response.json({ success: false, error }, { status });
}

function voiceLanguageCookie(language) {
  const value = text(language).toLowerCase();
  if (!/^[a-z]{2,3}$/.test(value)) return null;
  return [
    `${VOICE_LANGUAGE_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/api/operator",
    `Max-Age=${VOICE_LANGUAGE_COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ].join("; ");
}

function completedResponse(result, { mode, locale, speechLanguage = null }) {
  const transcript = text(result?.transcript);
  if (!transcript && mode !== "wake") return errorResponse("No speech detected", 422);
  const detectedLanguage = text(result?.detected_language) || null;
  const language = text(result?.language) || detectedLanguage;
  const languageSource = text(result?.language_source) || (speechLanguage ? "requested" : detectedLanguage ? "detected" : null);
  const detected = mode === "wake" ? wakeDetected(transcript) : false;
  const response = Response.json({
    success: true,
    pending: false,
    job_id: result?.job_id || null,
    transcript,
    wake_detected: detected,
    mode,
    language: language || null,
    detected_language: detectedLanguage,
    language_source: languageSource,
    ui_locale: locale,
    voice_language_continuity_seconds: language ? VOICE_LANGUAGE_COOKIE_MAX_AGE_SECONDS : 0,
  });
  const cookie = voiceLanguageCookie(language);
  if (cookie) {
    response.headers.append("Set-Cookie", cookie);
    response.headers.set("X-Avantiqo-Detected-Language", language);
  }
  return response;
}

async function authorizedContext({ request, organizationId, requestedEntityId = null }) {
  if (!organizationId) return { error: errorResponse("Organization required", 400) };
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { error: errorResponse(access.error, access.status || 403) };
  const partyId = access.staff?.party_id || access.staff?.partyId || null;
  if (!partyId) return { error: errorResponse("Authenticated staff account is not linked to a party", 409) };
  const businessContext = await resolveBusinessContext({
    organizationId: access.organizationId,
    entityId: requestedEntityId,
    request,
    access,
  });
  if (!businessContext.success) return { error: errorResponse(businessContext.error, businessContext.status || 400) };
  return { access, partyId, businessContext };
}

export async function POST(request) {
  const startedAt = Date.now();
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const organizationId = text(form.get("organizationId") || form.get("organization_id"));
    const requestedEntityId = text(form.get("entityId") || form.get("entity_id")) || null;
    const locale = text(form.get("locale")) || null;
    const speechLanguage = text(form.get("speechLanguage") || form.get("speech_language") || form.get("language")) || null;
    const mode = text(form.get("mode")).toLowerCase() === "wake" ? "wake" : "command";
    if (!audio || typeof audio.arrayBuffer !== "function") return errorResponse("Audio file required", 400);

    const context = await authorizedContext({ request, organizationId, requestedEntityId });
    if (context.error) return context.error;
    const language = mode === "wake" ? null : speechLanguage ? speechLanguage.split("-")[0] : null;
    const prompt = mode === "wake" ? wakePrompt() : commandPrompt(context.businessContext.organizationId);

    const result = await startOperatorAsyncTranscription({
      organizationId: context.businessContext.organizationId,
      entityId: context.businessContext.entityId,
      partyId: context.partyId,
      audio,
      fileName: audio.name || "avantiqo-voice.wav",
      mimeType: audio.type || "audio/wav",
      language,
      prompt,
      locale,
      metadata: {
        operation: mode === "wake" ? "WAKE_TRANSCRIPTION" : "VOICE_TRANSCRIPTION",
        transcription_mode: mode,
        ui_locale: locale,
        speech_language_override: speechLanguage,
        automatic_language_detection: mode === "wake" || !speechLanguage,
      },
    });

    if (result.pending === true) {
      console.log("OPERATOR_TRANSCRIPTION_STARTED", {
        mode,
        duration_ms: Date.now() - startedAt,
        job_id: result.job_id,
        generation_submitted: true,
        async: true,
      });
      return Response.json({
        success: true,
        pending: true,
        job_id: result.job_id,
        mode,
        ui_locale: locale,
        speech_language: speechLanguage,
        expires_at: result.expires_at || null,
      }, { status: 202, headers: { "Retry-After": "2" } });
    }

    console.log("OPERATOR_TRANSCRIPTION_COMPLETE", {
      mode,
      duration_ms: Date.now() - startedAt,
      transcript_length: text(result.transcript).length,
      async: true,
    });
    return completedResponse(result, { mode, locale, speechLanguage });
  } catch (error) {
    console.error("OPERATOR_TRANSCRIPTION_ERROR", error);
    return errorResponse(error?.message || "Voice transcription failed", error?.status || 500);
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const jobId = text(url.searchParams.get("jobId") || url.searchParams.get("job_id"));
    const mode = text(url.searchParams.get("mode")).toLowerCase() === "wake" ? "wake" : "command";
    const locale = text(url.searchParams.get("locale")) || null;
    const speechLanguage = text(url.searchParams.get("speechLanguage") || url.searchParams.get("speech_language")) || null;
    if (!jobId) return errorResponse("Transcription job required", 400);

    const context = await authorizedContext({ request, organizationId });
    if (context.error) return context.error;
    const result = await pollOperatorAsyncTranscription({
      jobId,
      organizationId: context.businessContext.organizationId,
    });

    if (result.pending === true) {
      return Response.json({
        success: true,
        pending: true,
        job_id: result.job_id,
        status: result.status || "PENDING",
        provider_status: result.provider_status || null,
        mode,
      }, { status: 202, headers: { "Retry-After": "2" } });
    }
    if (result.success === false) return errorResponse(result.error || "Voice transcription failed", 502);
    return completedResponse(result, { mode, locale, speechLanguage });
  } catch (error) {
    console.error("OPERATOR_TRANSCRIPTION_POLL_ERROR", error);
    return errorResponse(error?.message || "Voice transcription failed", error?.status || 500);
  }
}

export async function DELETE(request) {
  try {
    const url = new URL(request.url);
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const organizationId = text(
      body?.organizationId || body?.organization_id || url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );
    const jobId = text(body?.jobId || body?.job_id || url.searchParams.get("jobId") || url.searchParams.get("job_id"));
    const reason = text(body?.reason || url.searchParams.get("reason")) || null;
    if (!jobId) return errorResponse("Transcription job required", 400);

    const context = await authorizedContext({ request, organizationId });
    if (context.error) return context.error;
    const result = await cancelOperatorAsyncTranscription({
      jobId,
      organizationId: context.businessContext.organizationId,
      reason,
    });
    return Response.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error?.message || "Voice transcription cancellation failed";
    return errorResponse(message, message.includes("NOT_FOUND") ? 404 : error?.status || 500);
  }
}
