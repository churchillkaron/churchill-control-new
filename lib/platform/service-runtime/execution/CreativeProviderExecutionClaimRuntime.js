import crypto from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/admin.js";

export const CREATIVE_PROVIDER_EXECUTION_EXACTLY_ONCE_CONTRACT =
  "CREATIVE_PROVIDER_EXECUTION_EXACTLY_ONCE_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

function sha(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

function firstRow(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

export function providerExecutionKey({
  task_id = null,
  capability,
  metadata = {},
} = {}) {
  const explicit = text(
    metadata.provider_execution_key ||
      metadata.providerExecutionKey ||
      metadata.execution_key ||
      metadata.executionKey,
  );
  if (explicit) return explicit;
  if (task_id) return "creative-task:" + text(task_id) + ":" + text(capability);
  return null;
}

export function providerCertificationFingerprint(certification = {}) {
  return sha({
    contract: "AVANTIQO_PROVIDER_CERTIFICATION_FINGERPRINT_V1",
    certification: object(certification),
  });
}

export function providerExecutionRequestHash({
  organization_id,
  task_id = null,
  service_id,
  capability,
  model = null,
  provider = null,
  payload = {},
  metadata = {},
} = {}) {
  return sha({
    contract: CREATIVE_PROVIDER_EXECUTION_EXACTLY_ONCE_CONTRACT,
    organization_id: text(organization_id),
    task_id: text(task_id) || null,
    service_id: text(service_id),
    capability: text(capability),
    provider: text(provider) || null,
    model: text(model) || null,
    payload,
    approved_execution_hash: metadata.approved_execution_hash || null,
    approved_manifest_hash: metadata.approved_manifest_hash || null,
    production_dossier_asset_node_id:
      metadata.production_dossier_asset_node_id || null,
    provider_certification_fingerprint:
      metadata.provider_certification_fingerprint || null,
  });
}

export async function claimProviderExecution({
  organization_id,
  task_id = null,
  execution_key,
  request_hash,
  capability,
  metadata = {},
} = {}) {
  if (!execution_key) {
    return {
      required: false,
      claimed: false,
      claim_id: null,
      status: null,
      submission_allowed: true,
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
    "claim_creative_provider_execution",
    {
      p_organization_id: organization_id,
      p_task_id: task_id || null,
      p_execution_key: execution_key,
      p_request_hash: request_hash,
      p_capability: capability,
      p_metadata: {
        contract: CREATIVE_PROVIDER_EXECUTION_EXACTLY_ONCE_CONTRACT,
        ...object(metadata),
      },
    },
  );
  if (error) throw error;

  const row = firstRow(data);
  if (!row) throw new Error("CREATIVE_PROVIDER_EXECUTION_CLAIM_REQUIRED");

  return {
    required: true,
    claimed: row.submission_allowed === true,
    claim_id: row.claim_id,
    status: row.status,
    submission_allowed: row.submission_allowed === true,
    provider: row.provider || null,
    model: row.model || null,
    usage_id: row.usage_id || null,
    provider_job_id: row.provider_job_id || null,
  };
}

async function rpc(name, args) {
  const { data, error } = await supabaseAdmin.rpc(name, args);
  if (error) throw error;
  return firstRow(data);
}

export async function markProviderExecutionSubmitting({
  claim_id,
} = {}) {
  if (!claim_id) return null;
  return rpc("mark_creative_provider_execution_submitting", {
    p_claim_id: claim_id,
  });
}

export async function markProviderExecutionSubmitted({
  claim_id,
  provider,
  model,
  usage_id,
  provider_job_id,
} = {}) {
  if (!claim_id) return null;
  return rpc("mark_creative_provider_execution_submitted", {
    p_claim_id: claim_id,
    p_provider: provider || null,
    p_model: model || null,
    p_usage_id: usage_id || null,
    p_provider_job_id: provider_job_id || null,
  });
}

export async function markProviderExecutionCompleted({
  claim_id,
  provider,
  model,
  usage_id,
  provider_job_id = null,
} = {}) {
  if (!claim_id) return null;
  return rpc("mark_creative_provider_execution_completed", {
    p_claim_id: claim_id,
    p_provider: provider || null,
    p_model: model || null,
    p_usage_id: usage_id || null,
    p_provider_job_id: provider_job_id || null,
  });
}

export async function markProviderExecutionAmbiguous({
  claim_id,
  reason,
} = {}) {
  if (!claim_id) return null;
  return rpc("mark_creative_provider_execution_ambiguous", {
    p_claim_id: claim_id,
    p_reason: text(reason) || "UNKNOWN_PROVIDER_SUBMISSION_STATE",
  });
}

export async function markProviderExecutionFailedPreSubmission({
  claim_id,
  reason,
} = {}) {
  if (!claim_id) return null;
  return rpc("mark_creative_provider_execution_failed_pre_submission", {
    p_claim_id: claim_id,
    p_reason: text(reason) || "PRE_SUBMISSION_FAILURE",
  });
}

export async function markProviderExecutionFailedTerminal({
  claim_id,
  reason,
} = {}) {
  if (!claim_id) return null;
  return rpc("mark_creative_provider_execution_failed_terminal", {
    p_claim_id: claim_id,
    p_reason: text(reason) || "PROVIDER_EXECUTION_FAILED",
  });
}

export const CreativeProviderExecutionClaimRuntime = Object.freeze({
  contract: CREATIVE_PROVIDER_EXECUTION_EXACTLY_ONCE_CONTRACT,
  key: providerExecutionKey,
  requestHash: providerExecutionRequestHash,
  certificationFingerprint: providerCertificationFingerprint,
  claim: claimProviderExecution,
  submitting: markProviderExecutionSubmitting,
  submitted: markProviderExecutionSubmitted,
  completed: markProviderExecutionCompleted,
  ambiguous: markProviderExecutionAmbiguous,
  failedPreSubmission: markProviderExecutionFailedPreSubmission,
  failedTerminal: markProviderExecutionFailedTerminal,
});
