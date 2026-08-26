import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  acquireVoiceRunpodWebLease,
  releaseVoiceRunpodWebLease,
} from "@/lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceRunpodLeaseRuntime";

const CONTRACT = "AVANTIQO_OPERATOR_ASYNC_SPEECH_V1";
const CAPABILITY = "ai.text.to.speech";
const LANE = "voice-tts";
const LEASE_TTL_SECONDS = 1800;

function text(value) {
  return String(value ?? "").trim();
}

function findAudioBase64(value, depth = 0) {
  if (depth > 10 || !value) return null;
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
  for (const child of Object.values(value)) {
    const found = findAudioBase64(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function audioBufferFromResult(result) {
  const encoded = findAudioBase64(result);
  if (!encoded) throw new Error("AVANTIQO_OPERATOR_ASYNC_SPEECH_AUDIO_REQUIRED");
  const audio = Buffer.from(encoded, "base64");
  if (audio.length <= 1000 || audio.subarray(0, 4).toString("ascii") !== "RIFF") {
    throw new Error("AVANTIQO_OPERATOR_ASYNC_SPEECH_WAV_INVALID");
  }
  return audio;
}

async function loadJob({ jobId, organizationId }) {
  const { data, error } = await supabaseAdmin
    .from("avantiqo_voice_async_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .eq("capability", CAPABILITY)
    .eq("lane", LANE)
    .maybeSingle();
  if (error) throw new Error(`AVANTIQO_OPERATOR_ASYNC_SPEECH_JOB_LOOKUP_FAILED:${error.code || "DB"}`);
  if (!data) throw new Error("AVANTIQO_OPERATOR_ASYNC_SPEECH_JOB_NOT_FOUND");
  return data;
}

async function loadLease(leaseId) {
  const { data, error } = await supabaseAdmin
    .from("avantiqo_voice_runpod_leases")
    .select("id,contract,lane,endpoint_id,endpoint_name,owner_request_id,state,expires_at")
    .eq("id", leaseId)
    .maybeSingle();
  if (error) throw new Error(`AVANTIQO_OPERATOR_ASYNC_SPEECH_LEASE_LOOKUP_FAILED:${error.code || "DB"}`);
  if (!data) throw new Error("AVANTIQO_OPERATOR_ASYNC_SPEECH_LEASE_NOT_FOUND");
  return data;
}

async function updateJob(jobId, patch) {
  const { data, error } = await supabaseAdmin
    .from("avantiqo_voice_async_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .select("*")
    .single();
  if (error) throw new Error(`AVANTIQO_OPERATOR_ASYNC_SPEECH_JOB_UPDATE_FAILED:${error.code || "DB"}`);
  return data;
}

async function releaseForJob({ job, lease, state, reason, cancelExactJob = false }) {
  if (lease.state !== "ACTIVE") return lease;
  return releaseVoiceRunpodWebLease({
    leaseId: lease.id,
    ownerRequestId: lease.owner_request_id,
    lane: lease.lane,
    endpointId: lease.endpoint_id,
    providerJobId: job.provider_job_id,
    finalState: state,
    reason,
    cancelExactJob,
  });
}

export async function startOperatorAsyncSpeech({
  organizationId,
  entityId = null,
  partyId,
  speechText,
  language,
  locale = null,
  voiceLibraryProfileId = null,
  deliveryProfile = null,
  quantity,
  metadata = {},
}) {
  const organization = text(organizationId);
  const party = text(partyId);
  const spokenText = text(speechText);
  if (!organization || !party || !spokenText) {
    throw new Error("AVANTIQO_OPERATOR_ASYNC_SPEECH_INPUT_REQUIRED");
  }

  const lease = await acquireVoiceRunpodWebLease({
    organizationId: organization,
    lane: LANE,
    ttlSeconds: LEASE_TTL_SECONDS,
  });

  let job = null;
  let execution = null;
  try {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("avantiqo_voice_async_jobs")
      .insert({
        organization_id: organization,
        entity_id: entityId || null,
        party_id: party,
        capability: CAPABILITY,
        lane: LANE,
        lease_id: lease.lease_id,
        status: "STARTING",
        expires_at: lease.expires_at,
        quantity,
        unit: "minute",
        metadata: {
          contract: CONTRACT,
          module: "OPERATOR",
          operation: "VOICE_RESPONSE",
          channel: "voice",
          language: text(language) || null,
          locale: text(locale) || null,
          voice_identity_profile_id: text(voiceLibraryProfileId) || null,
          voice_delivery_profile: text(deliveryProfile) || null,
          ...metadata,
        },
      })
      .select("*")
      .single();
    if (insertError) {
      throw new Error(`AVANTIQO_OPERATOR_ASYNC_SPEECH_JOB_CREATE_FAILED:${insertError.code || "DB"}`);
    }
    job = inserted;

    execution = await ServiceExecutionRuntime.execute({
      organization_id: organization,
      party_id: party,
      entity_id: entityId || null,
      service_id: CAPABILITY,
      input: {
        input: spokenText,
        response_format: "wav",
        quantity,
        locale: text(locale || language) || undefined,
        language: text(language) || undefined,
        voice_library_profile_id: text(voiceLibraryProfileId) || undefined,
        voice_profile: text(deliveryProfile) || undefined,
        runpod_safe_lease: lease,
      },
      metadata: {
        module: "OPERATOR",
        operation: "VOICE_RESPONSE_ASYNC",
        channel: "voice",
        async_voice_contract: CONTRACT,
        ...metadata,
      },
      category: "AI",
    });

    if (execution?.pending !== true) {
      const audio = audioBufferFromResult(execution);
      await releaseForJob({
        job,
        lease: await loadLease(lease.lease_id),
        state: "RELEASED",
        reason: "VOICE_TTS_COMPLETED_IMMEDIATELY",
      });
      await updateJob(job.id, {
        status: "COMPLETED",
        provider: execution?.provider || "avantiqo-voice",
        provider_job_id: execution?.provider_job_id || null,
        provider_status: "completed",
        usage_id: execution?.usage?.id || null,
        credential_id: execution?.credential_id || null,
        pricing: execution?.pricing || {},
        started_at: execution?.started_at || new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
      return {
        success: true,
        pending: false,
        contract: CONTRACT,
        job_id: job.id,
        audio,
      };
    }

    job = await updateJob(job.id, {
      status: "PENDING",
      provider: execution.provider,
      provider_job_id: execution.provider_job_id,
      provider_status: execution.provider_status || "PENDING",
      usage_id: execution.usage?.id || null,
      credential_id: execution.credential_id || null,
      pricing: execution.pricing || {},
      quantity,
      unit: execution.pricing?.unit || "minute",
      started_at: execution.started_at || new Date().toISOString(),
    });

    return {
      success: true,
      pending: true,
      contract: CONTRACT,
      job_id: job.id,
      provider_status: job.provider_status,
      expires_at: job.expires_at,
    };
  } catch (error) {
    if (job?.id) {
      await updateJob(job.id, {
        status: "FAILED",
        error_code: text(error?.message).split(":")[0].slice(0, 180) || "AVANTIQO_OPERATOR_ASYNC_SPEECH_START_FAILED",
        completed_at: new Date().toISOString(),
      }).catch(() => null);
    }
    await releaseVoiceRunpodWebLease({
      leaseId: lease.lease_id,
      ownerRequestId: lease.owner_request_id,
      lane: lease.lane,
      endpointId: lease.endpoint_id,
      providerJobId: execution?.provider_job_id || null,
      finalState: "FAILED",
      reason: error?.message || "VOICE_TTS_START_FAILED",
      cancelExactJob: Boolean(execution?.provider_job_id),
    }).catch(() => null);
    throw error;
  }
}

export async function pollOperatorAsyncSpeech({ jobId, organizationId }) {
  const job = await loadJob({ jobId, organizationId });
  const lease = await loadLease(job.lease_id);

  if (job.status === "FAILED" || job.status === "EXPIRED" || job.status === "CANCELLED") {
    return {
      success: false,
      pending: false,
      contract: CONTRACT,
      job_id: job.id,
      status: job.status,
      error: job.error_code || "AVANTIQO_OPERATOR_ASYNC_SPEECH_FAILED",
    };
  }

  if (job.status === "STARTING") {
    if (Date.parse(job.expires_at) <= Date.now()) {
      return {
        success: false,
        pending: false,
        contract: CONTRACT,
        job_id: job.id,
        status: "EXPIRED",
        error: "AVANTIQO_OPERATOR_ASYNC_SPEECH_START_EXPIRED",
      };
    }
    return {
      success: true,
      pending: true,
      contract: CONTRACT,
      job_id: job.id,
      status: "STARTING",
    };
  }

  if (!job.provider || !job.provider_job_id || !job.usage_id) {
    throw new Error("AVANTIQO_OPERATOR_ASYNC_SPEECH_SETTLEMENT_IDENTITY_REQUIRED");
  }

  const settled = await ServiceExecutionRuntime.settle({
    organization_id: job.organization_id,
    provider: job.provider,
    provider_job_id: job.provider_job_id,
    usage_id: job.usage_id,
    pricing: job.pricing || {},
    quantity: job.quantity,
    unit: job.unit,
    metadata: {
      ...(job.metadata || {}),
      async_voice_contract: CONTRACT,
      async_voice_job_id: job.id,
    },
    provider_status_input: {
      capability: CAPABILITY,
    },
    credential_id: job.credential_id || null,
    started_at: job.started_at || null,
  });

  if (settled?.pending === true) {
    if (job.provider_status !== settled.provider_status) {
      await updateJob(job.id, {
        provider_status: settled.provider_status || job.provider_status,
      });
    }
    return {
      success: true,
      pending: true,
      contract: CONTRACT,
      job_id: job.id,
      status: "PENDING",
      provider_status: settled.provider_status || job.provider_status,
    };
  }

  if (settled?.failed === true || settled?.success === false) {
    await releaseForJob({
      job,
      lease,
      state: "FAILED",
      reason: settled?.error || "VOICE_TTS_PROVIDER_FAILED",
      cancelExactJob: false,
    }).catch(() => null);
    await updateJob(job.id, {
      status: "FAILED",
      provider_status: settled?.provider_status || "failed",
      error_code: text(settled?.error).slice(0, 180) || "AVANTIQO_OPERATOR_ASYNC_SPEECH_PROVIDER_FAILED",
      completed_at: new Date().toISOString(),
    });
    return {
      success: false,
      pending: false,
      contract: CONTRACT,
      job_id: job.id,
      status: "FAILED",
      error: settled?.error || "Voice generation failed",
    };
  }

  const audio = audioBufferFromResult(settled);
  if (lease.state === "ACTIVE") {
    await releaseForJob({
      job,
      lease,
      state: "RELEASED",
      reason: "VOICE_TTS_SETTLED",
    });
  }
  if (job.status !== "COMPLETED") {
    await updateJob(job.id, {
      status: "COMPLETED",
      provider_status: settled?.provider_status || "completed",
      completed_at: new Date().toISOString(),
      error_code: null,
    });
  }

  return {
    success: true,
    pending: false,
    contract: CONTRACT,
    job_id: job.id,
    status: "COMPLETED",
    audio,
  };
}

export async function cancelOperatorAsyncSpeech({ jobId, organizationId, reason = null }) {
  const job = await loadJob({ jobId, organizationId });
  if (["COMPLETED", "FAILED", "EXPIRED", "CANCELLED"].includes(job.status)) {
    return {
      success: true,
      pending: false,
      contract: CONTRACT,
      job_id: job.id,
      status: job.status,
      already_terminal: true,
    };
  }

  const lease = await loadLease(job.lease_id);
  if (lease.state === "ACTIVE") {
    await releaseForJob({
      job,
      lease,
      state: "RELEASED",
      reason: text(reason) || "VOICE_TTS_CANCELLED_BY_CLIENT",
      cancelExactJob: Boolean(job.provider_job_id),
    });
  }

  await updateJob(job.id, {
    status: "CANCELLED",
    provider_status: "cancelled",
    error_code: "AVANTIQO_OPERATOR_ASYNC_SPEECH_CANCELLED",
    completed_at: new Date().toISOString(),
  });

  return {
    success: true,
    pending: false,
    contract: CONTRACT,
    job_id: job.id,
    status: "CANCELLED",
    exact_provider_job_cancel_requested: Boolean(job.provider_job_id),
    blind_queue_purge_requested: false,
  };
}

export const OperatorVoiceAsyncSpeechRuntime = {
  start: startOperatorAsyncSpeech,
  poll: pollOperatorAsyncSpeech,
  cancel: cancelOperatorAsyncSpeech,
};
