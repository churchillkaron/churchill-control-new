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
      },
      metadata: {
        module: "OPERATOR",
        operation: "VOICE_TRANSCRIPTION",
        channel: "voice",
      },
      category: "AI",
    });

    const transcript = findTranscript(execution);
    if (!transcript) {
      return errorResponse("Voice transcription returned no text", 502);
    }

    return Response.json({
      success: true,
      transcript,
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
