import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const OWNED_PROVIDER = "avantiqo-voice";
const OWNED_PROVIDER_POLICY = Object.freeze({
  allowed_providers: Object.freeze([OWNED_PROVIDER]),
  preferred_providers: Object.freeze([OWNED_PROVIDER]),
  owned_only_required: true,
  external_fallback_allowed: false,
});

export function voiceText(value) { return String(value ?? "").trim(); }
export function voiceObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

export async function loadVoiceAsyncJob({ jobId, organizationId, capability, lane, notFoundCode }) {
  const result = await supabaseAdmin.from("avantiqo_voice_async_jobs").select("*")
    .eq("id", jobId).eq("organization_id", organizationId).eq("capability", capability).eq("lane", lane).maybeSingle();
  if (result.error) throw new Error(`${notFoundCode}_LOOKUP_FAILED:${result.error.code || "DB"}`);
  if (!result.data) throw new Error(`${notFoundCode}_NOT_FOUND`);
  return result.data;
}

export async function insertVoiceAsyncJob({ organizationId, entityId, partyId, capability, lane, metadata }) {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const result = await supabaseAdmin.from("avantiqo_voice_async_jobs").insert({
    organization_id: organizationId,
    entity_id: entityId || null,
    party_id: partyId || null,
    capability,
    lane,
    status: "STARTING",
    expires_at: expiresAt,
    metadata: metadata || {},
  }).select("*").single();
  if (result.error) throw new Error(`AVANTIQO_OPERATOR_ASYNC_VOICE_JOB_CREATE_FAILED:${result.error.code || "DB"}`);
  return result.data;
}

export async function updateVoiceAsyncJob(jobId, patch) {
  const result = await supabaseAdmin.from("avantiqo_voice_async_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId).select("*").single();
  if (result.error) throw new Error(`AVANTIQO_OPERATOR_ASYNC_VOICE_JOB_UPDATE_FAILED:${result.error.code || "DB"}`);
  return result.data;
}

export async function submitVoiceService({ job, organizationId, entityId, partyId, capability, input, metadata }) {
  const execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId || null,
    service_id: capability,
    provider_id: OWNED_PROVIDER,
    provider_policy: OWNED_PROVIDER_POLICY,
    input,
    metadata,
    category: "AI",
  });
  if (voiceText(execution?.provider) !== OWNED_PROVIDER) throw new Error("AVANTIQO_OPERATOR_ASYNC_VOICE_EXTERNAL_PROVIDER_FORBIDDEN");
  const patch = {
    provider: OWNED_PROVIDER,
    provider_job_id: execution?.provider_job_id || null,
    provider_status: execution?.provider_status || (execution?.pending ? "PENDING" : "completed"),
    usage_id: execution?.usage?.id || null,
    credential_id: execution?.credential_id || null,
    pricing: execution?.pricing || {},
    quantity: execution?.usage?.quantity ?? null,
    unit: execution?.usage?.unit || execution?.pricing?.unit || null,
    started_at: execution?.started_at || new Date().toISOString(),
    status: execution?.pending ? "PENDING" : "COMPLETED",
    completed_at: execution?.pending ? null : new Date().toISOString(),
  };
  await updateVoiceAsyncJob(job.id, patch);
  return execution;
}

export async function settleVoiceJob(job, capability, contract) {
  if (!job.provider_job_id || !job.usage_id) throw new Error("AVANTIQO_OPERATOR_ASYNC_VOICE_SETTLEMENT_IDENTITY_REQUIRED");
  const settled = await ServiceExecutionRuntime.settle({
    organization_id: job.organization_id,
    provider: OWNED_PROVIDER,
    provider_job_id: job.provider_job_id,
    usage_id: job.usage_id,
    pricing: job.pricing || {},
    quantity: job.quantity,
    unit: job.unit,
    metadata: { ...(job.metadata || {}), async_voice_contract: contract, async_voice_job_id: job.id },
    provider_status_input: { capability },
    credential_id: job.credential_id || null,
    started_at: job.started_at || null,
  });
  if (settled?.pending) {
    await updateVoiceAsyncJob(job.id, { provider_status: settled.provider_status || job.provider_status });
    return settled;
  }
  if (settled?.failed || settled?.success === false) {
    await updateVoiceAsyncJob(job.id, { status: "FAILED", provider_status: settled?.provider_status || "failed", error_code: voiceText(settled?.error).slice(0,180) || "AVANTIQO_OPERATOR_ASYNC_VOICE_PROVIDER_FAILED", completed_at: new Date().toISOString() });
    return settled;
  }
  await updateVoiceAsyncJob(job.id, { status: "COMPLETED", provider_status: settled?.provider_status || "completed", error_code: null, completed_at: new Date().toISOString() });
  return settled;
}

export async function cancelVoiceJob(job, contract) {
  if (["COMPLETED","FAILED","EXPIRED","CANCELLED"].includes(job.status)) {
    return { success: true, pending: false, contract, job_id: job.id, status: job.status, already_terminal: true };
  }
  await updateVoiceAsyncJob(job.id, { status: "CANCELLED", provider_status: "cancelled", error_code: "AVANTIQO_OPERATOR_ASYNC_VOICE_CANCELLED", completed_at: new Date().toISOString() });
  return { success: true, pending: false, contract, job_id: job.id, provider: OWNED_PROVIDER, status: "CANCELLED", exact_provider_job_cancel_requested: false, provider_execution_may_finish_in_background: Boolean(job.provider_job_id), blind_queue_purge_requested: false };
}
