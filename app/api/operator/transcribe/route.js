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
  listOperatorNavigationTargets,
} from "@/lib/operator/runtime/OperatorNavigationCatalog";
import {
  settleOperatorVoiceExecution,
} from "@/lib/operator/runtime/OperatorVoiceServiceSettlement";

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
  const hasName = [
    "avantiqo",
    "avantiq",
    "avantiqo",
    "avantiqo",
    "avantico",
    "avantigo",
    "avantiko",
    "avantiquo",
    "avanti",
  ].some((name) => compact.includes(name));

  if (!hasName) return false;

  const words = candidate.split(" ").filter(Boolean);
  const hasGreeting = words.some((word) =>
    ["hey", "hay", "hei", "hi", "hello"].includes(word),
  );

  return hasGreeting || words.length <= 4;
}

function findTranscript(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTranscript(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";

  for (const key of ["text", "transcript", "output_text"]) {
    if (typeof value[key] === "string" && value[key].trim()) {
      return value[key].trim();
    }
  }

  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findTranscript(value[key], depth + 1);
    if (found) return found;
  }

  return "";
}

function findVoiceField(value, field, depth = 0) {
  if (depth > 9 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVoiceField(item, field, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const direct = text(value[field]);
  if (direct) return direct;

  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findVoiceField(value[key], field, depth + 1);
    if (found) return found;
  }

  return null;
}

function commandVocabulary(organizationId) {
  const targets = listOperatorNavigationTargets({ organizationId });
  const labels = [];
  const seen = new Set();

  for (const target of targets) {
    for (const candidate of [
      target?.name,
      target?.domain_id,
      target?.group_name,
    ]) {
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

function errorResponse(error, status = 500) {
  return Response.json(
    {
      success: false,
      error,
    },
    { status },
  );
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

export async function POST(request) {
  const startedAt = Date.now();

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const organizationId = text(
      form.get("organizationId") || form.get("organization_id"),
    );
    const requestedEntityId = text(
      form.get("entityId") || form.get("entity_id"),
    ) || null;
    const locale = text(form.get("locale")) || null;
    const speechLanguage = text(
      form.get("speechLanguage") ||
      form.get("speech_language") ||
      form.get("language"),
    ) || null;
    const mode = text(form.get("mode")).toLowerCase() === "wake"
      ? "wake"
      : "command";

    if (!audio || typeof audio.arrayBuffer !== "function") {
      return errorResponse("Audio file required", 400);
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

    const execution = await ServiceExecutionRuntime.execute({
      organization_id: businessContext.organizationId,
      party_id: partyId,
      entity_id: businessContext.entityId,
      service_id: "ai.speech.to.text",
      input: {
        upload_file: audio,
        file_name: audio.name || "avantiqo-voice.wav",
        mime_type: audio.type || "audio/wav",
        language:
          mode === "wake"
            ? undefined
            : speechLanguage
              ? speechLanguage.split("-")[0]
              : undefined,
        prompt:
          mode === "wake"
            ? [
                "This is wake-word detection for the assistant Avantiqo.",
                "Avantiqo is spelled A-v-a-n-t-i-q-o.",
                "The speaker can have any accent or language background.",
                "Listen especially for pronunciations or transcriptions resembling Avantiqo, Avanti Q, Avanti Q O, Avanti Go, Avantico, Avantiko, Avanti Quo, or Avanti.",
                "If that name is spoken, preserve it as Avantiqo in the transcript and preserve any words spoken immediately after it.",
              ].join(" ")
            : commandPrompt(businessContext.organizationId),
      },
      metadata: {
        module: "OPERATOR",
        operation:
          mode === "wake"
            ? "WAKE_TRANSCRIPTION"
            : "VOICE_TRANSCRIPTION",
        channel: "voice",
        transcription_mode: mode,
        ui_locale: locale,
        speech_language_override: speechLanguage,
        automatic_language_detection: mode === "wake" || !speechLanguage,
      },
      category: "AI",
    });

    const settledExecution = await settleOperatorVoiceExecution({
      execution,
      organizationId: businessContext.organizationId,
      capability: "ai.speech.to.text",
      metadata: {
        module: "OPERATOR",
        operation:
          mode === "wake"
            ? "WAKE_TRANSCRIPTION"
            : "VOICE_TRANSCRIPTION",
        channel: "voice",
        transcription_mode: mode,
      },
    });

    const transcript = findTranscript(settledExecution);
    if (!transcript) {
      return errorResponse("Voice transcription returned no text", 502);
    }

    const detectedLanguage = findVoiceField(settledExecution, "detected_language");
    const language = findVoiceField(settledExecution, "language") || detectedLanguage;
    const languageSource =
      findVoiceField(settledExecution, "language_source") ||
      (speechLanguage ? "requested" : detectedLanguage ? "detected" : null);
    const detected = mode === "wake" ? wakeDetected(transcript) : false;

    console.log("OPERATOR_TRANSCRIPTION_COMPLETE", {
      mode,
      duration_ms: Date.now() - startedAt,
      transcript_length: transcript.length,
      wake_detected: detected,
      language: language || null,
      detected_language: detectedLanguage || null,
      language_source: languageSource,
      ui_locale: locale,
      usage_id: settledExecution?.usage?.id || execution?.usage?.id || null,
    });

    const response = Response.json({
      success: true,
      transcript,
      wake_detected: detected,
      mode,
      language: language || null,
      detected_language: detectedLanguage || null,
      language_source: languageSource,
      ui_locale: locale,
      voice_language_continuity_seconds: language
        ? VOICE_LANGUAGE_COOKIE_MAX_AGE_SECONDS
        : 0,
    });
    const cookie = voiceLanguageCookie(language);
    if (cookie) {
      response.headers.append("Set-Cookie", cookie);
      response.headers.set("X-Avantiqo-Detected-Language", language);
    }
    return response;
  } catch (error) {
    console.error("OPERATOR_TRANSCRIPTION_ERROR", error);

    return errorResponse(
      error?.message || "Voice transcription failed",
      error?.status || 500,
    );
  }
}
