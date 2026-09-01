import { resolveVoiceReferenceForExecution } from "./AvantiqoVoiceLibrary.js";
import { AvantiqoVoiceProvider as LegacyVoiceProvider } from "./AvantiqoVoiceProvider.js";
import {
  executeVoiceModalDirect,
  getVoiceModalDirectStatus,
  isVoiceModalDirectJob,
  voiceModalDirectConfigured,
} from "./AvantiqoVoiceModalDirectRuntime.js";

const VOICE_REFERENCE_CONTRACT = "AVANTIQO_VOICE_REFERENCE_V1";
const VOICE_REFERENCE_CONSENT_BASES = new Set(["SELF", "AUTHORIZED", "LICENSED"]);
const VOICE_REFERENCE_MIME_TYPES = new Set([
  "audio/wav", "audio/x-wav", "audio/wave", "audio/mpeg", "audio/mp3",
  "audio/mp4", "audio/x-m4a", "audio/webm", "audio/ogg", "audio/flac",
]);
const MAX_STT_BYTES = 25 * 1024 * 1024;
const MAX_VOICE_REFERENCE_BYTES = 20 * 1024 * 1024;

function text(value) { return String(value ?? "").trim(); }

function requireGovernedContext(input = {}) {
  const organizationId = text(input.context?.organization_id);
  const organizationServiceId = text(input.context?.organization_service_id);
  const usageId = text(input.context?.usage_id);
  const entityId = text(input.context?.entity_id) || null;
  if (!organizationId || !organizationServiceId || !usageId) {
    throw new Error("AVANTIQO_VOICE_GOVERNED_SERVICE_EXECUTION_REQUIRED");
  }
  return { organizationId, organizationServiceId, usageId, entityId };
}

function endpointForCapability(capability) {
  if (capability === "ai.speech.to.text") {
    return {
      capability,
      foundationModel: text(process.env.AVANTIQO_VOICE_STT_FOUNDATION_MODEL) || "openai/whisper-large-v3-turbo",
      productModel: "avantiqo-voice-stt-v1",
    };
  }
  if (capability === "ai.text.to.speech") {
    return {
      capability,
      foundationModel: text(process.env.AVANTIQO_VOICE_TTS_FOUNDATION_MODEL) || "resemble-ai/chatterbox:multilingual-v3",
      productModel: "avantiqo-voice-tts-v2",
    };
  }
  throw new Error(`AVANTIQO_VOICE_CAPABILITY_NOT_IMPLEMENTED:${capability}`);
}

async function uploadAudioPayload(input = {}) {
  const upload = input.upload_file || input.file || input.audio;
  if (!upload || typeof upload.arrayBuffer !== "function") throw new Error("AVANTIQO_VOICE_STT_AUDIO_FILE_REQUIRED");
  const bytes = Buffer.from(await upload.arrayBuffer());
  if (!bytes.length) throw new Error("AVANTIQO_VOICE_STT_AUDIO_EMPTY");
  if (bytes.length > MAX_STT_BYTES) throw new Error("AVANTIQO_VOICE_STT_AUDIO_TOO_LARGE");
  return {
    audio_base64: bytes.toString("base64"),
    file_name: text(input.file_name || upload.name) || "voice.wav",
    mime_type: text(input.mime_type || upload.type) || "audio/wav",
    size_bytes: bytes.length,
  };
}

function speechText(input = {}) {
  const value = text(input.input || input.text || input.message);
  if (!value) throw new Error("AVANTIQO_VOICE_TTS_TEXT_REQUIRED");
  if (value.length > 6000) throw new Error("AVANTIQO_VOICE_TTS_TEXT_TOO_LONG");
  return value;
}

function normalizeVoiceReferenceObject(reference) {
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) throw new Error("AVANTIQO_VOICE_REFERENCE_INVALID");
  if (text(reference.contract) !== VOICE_REFERENCE_CONTRACT) throw new Error("AVANTIQO_VOICE_REFERENCE_CONTRACT_INVALID");
  const consent = reference.consent || {};
  const consentBasis = text(consent.basis).toUpperCase();
  if (consent.confirmed !== true) throw new Error("AVANTIQO_VOICE_REFERENCE_CONSENT_REQUIRED");
  if (!VOICE_REFERENCE_CONSENT_BASES.has(consentBasis)) throw new Error("AVANTIQO_VOICE_REFERENCE_CONSENT_BASIS_INVALID");
  const mimeType = text(reference.mime_type).toLowerCase().split(";")[0];
  if (!VOICE_REFERENCE_MIME_TYPES.has(mimeType)) throw new Error(`AVANTIQO_VOICE_REFERENCE_MIME_NOT_CERTIFIED:${mimeType || "missing"}`);
  const audioBase64 = text(reference.audio_base64);
  if (!audioBase64) throw new Error("AVANTIQO_VOICE_REFERENCE_AUDIO_REQUIRED");
  const bytes = Buffer.from(audioBase64, "base64");
  if (!bytes.length) throw new Error("AVANTIQO_VOICE_REFERENCE_AUDIO_EMPTY");
  if (bytes.length > MAX_VOICE_REFERENCE_BYTES) throw new Error("AVANTIQO_VOICE_REFERENCE_AUDIO_TOO_LARGE");
  return {
    contract: VOICE_REFERENCE_CONTRACT,
    audio_base64: bytes.toString("base64"),
    mime_type: mimeType,
    profile_id: text(reference.profile_id) || null,
    consent: {
      confirmed: true,
      basis: consentBasis,
      evidence_id: text(consent.evidence_id) || null,
    },
  };
}

async function voiceReferencePayload(input = {}) {
  const existing = input.voice_reference || input.voiceReference || null;
  if (existing) return normalizeVoiceReferenceObject(existing);
  const upload = input.voice_reference_audio || input.voiceReferenceAudio || null;
  if (!upload) return null;
  if (typeof upload.arrayBuffer !== "function") throw new Error("AVANTIQO_VOICE_REFERENCE_AUDIO_FILE_REQUIRED");
  const bytes = Buffer.from(await upload.arrayBuffer());
  if (!bytes.length) throw new Error("AVANTIQO_VOICE_REFERENCE_AUDIO_EMPTY");
  if (bytes.length > MAX_VOICE_REFERENCE_BYTES) throw new Error("AVANTIQO_VOICE_REFERENCE_AUDIO_TOO_LARGE");
  return normalizeVoiceReferenceObject({
    contract: VOICE_REFERENCE_CONTRACT,
    audio_base64: bytes.toString("base64"),
    mime_type: text(input.voice_reference_mime_type || upload.type).toLowerCase().split(";")[0],
    profile_id: text(input.voice_reference_profile_id) || null,
    consent: {
      confirmed: input.voice_reference_consent_confirmed === true,
      basis: text(input.voice_reference_consent_basis).toUpperCase(),
      evidence_id: text(input.voice_reference_consent_evidence_id) || null,
    },
  });
}

async function resolveTtsVoiceSelection(input, context) {
  const directReference = await voiceReferencePayload(input);
  const explicitDeliveryProfile = text(input.voice_profile || input.voiceProfile);
  if (directReference) {
    return {
      voiceProfile: explicitDeliveryProfile || "avantiqo-secretary-v1",
      voiceReference: directReference,
      identitySource: "request_reference",
      identityProfileId: text(directReference.profile_id) || null,
    };
  }
  const requestedLibraryProfileId = text(
    input.voice_library_profile_id || input.voiceLibraryProfileId ||
    input.voice_identity_profile_id || input.voiceIdentityProfileId,
  ) || null;
  const librarySelection = await resolveVoiceReferenceForExecution({
    organizationId: context.organizationId,
    entityId: context.entityId,
    profileId: requestedLibraryProfileId,
  });
  return {
    voiceProfile: explicitDeliveryProfile || librarySelection?.voice_profile || "avantiqo-secretary-v1",
    voiceReference: librarySelection?.voice_reference || null,
    identitySource: librarySelection ? "organization_voice_library" : "avantiqo_builtin",
    identityProfileId: text(librarySelection?.voice_reference?.profile_id) || null,
  };
}

async function prepareWorkload(input, context, capability) {
  if (capability === "ai.speech.to.text") {
    return {
      workload: {
        ...(await uploadAudioPayload(input)),
        language: text(input.language) || null,
        vocabulary_context: text(input.prompt) || null,
      },
      ttsVoiceSelection: null,
    };
  }
  const selection = await resolveTtsVoiceSelection(input, context);
  return {
    workload: {
      text: speechText(input),
      language: text(input.locale || input.language).split("-")[0] || null,
      voice_profile: selection.voiceProfile,
      voice_reference: selection.voiceReference,
      response_format: "wav",
    },
    ttsVoiceSelection: selection,
  };
}

function enginePayload({ endpoint, capability, context, workload }) {
  return {
    contract: "AVANTIQO_VOICE_ENGINE_V1",
    capability,
    foundation_model: endpoint.foundationModel,
    organization_id: context.organizationId,
    usage_id: context.usageId,
    workload,
  };
}

export const AvantiqoVoiceProviderV2 = {
  id: "avantiqo-voice",
  async execute(input = {}) {
    const context = requireGovernedContext(input);
    const capability = text(input.capability);
    const endpoint = endpointForCapability(capability);

    if (!voiceModalDirectConfigured()) {
      return LegacyVoiceProvider.execute(input);
    }

    const prepared = await prepareWorkload(input, context, capability);
    return executeVoiceModalDirect({
      capability,
      payload: enginePayload({ endpoint, capability, context, workload: prepared.workload }),
      productModel: endpoint.productModel,
      foundationModel: endpoint.foundationModel,
      ttsVoiceSelection: prepared.ttsVoiceSelection,
    });
  },

  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!jobId) throw new Error("AVANTIQO_VOICE_JOB_ID_REQUIRED");
    if (isVoiceModalDirectJob(jobId)) return getVoiceModalDirectStatus(input);
    return LegacyVoiceProvider.getStatus(input);
  },
};
