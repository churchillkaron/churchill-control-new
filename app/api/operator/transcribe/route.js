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
    "avantico",
    "avantigo",
    "avantiko",
    "avanti",
  ].some((name) => compact.includes(name));

  if (!hasName) return false;

  const words = candidate.split(" ").filter(Boolean);
  const hasGreeting = words.some((word) =>
    ["hey", "hay", "hei", "hi", "hello"].includes(word),
  );

  return hasGreeting || words.length <= 3;
}

function findTranscript(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return "";
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
    const form = await request.formData();
    const audio = form.get("audio");
    const organizationId = text(
      form.get("organizationId") || form.get("organization_id"),
    );
    const requestedEntityId = text(
      form.get("entityId") || form.get("entity_id"),
    ) || null;
    const locale = text(form.get("locale")) || null;
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
        language: locale ? locale.split("-")[0] : undefined,
        prompt:
          mode === "wake"
            ? "The speaker may say the wake phrase Hey Avantiqo. Avantiqo is spelled A-v-a-n-t-i-q-o. Preserve the name Avantiqo exactly when it is heard."
            : undefined,
      },
      metadata: {
        module: "OPERATOR",
        operation:
          mode === "wake"
            ? "WAKE_TRANSCRIPTION"
            : "VOICE_TRANSCRIPTION",
        channel: "voice",
        transcription_mode: mode,
      },
      category: "AI",
    });

    const transcript = findTranscript(execution);
    if (!transcript) {
      return errorResponse("Voice transcription returned no text", 502);
    }

    const detected = mode === "wake" ? wakeDetected(transcript) : false;

    console.log("OPERATOR_TRANSCRIPTION_COMPLETE", {
      mode,
      duration_ms: Date.now() - startedAt,
      transcript_length: transcript.length,
      wake_detected: detected,
    });

    return Response.json({
      success: true,
      transcript,
      wake_detected: detected,
      mode,
      language:
        execution?.output?.output?.language ||
        execution?.output?.language ||
        null,
      provider_evidence: {
        provider: execution?.provider || null,
        model: execution?.model || null,
        usage_id: execution?.usage?.id || null,
      },
    });
  } catch (error) {
    console.error("OPERATOR_TRANSCRIPTION_ERROR", error);

    return errorResponse(
      error?.message || "Voice transcription failed",
      error?.status || 500,
    );
  }
}
