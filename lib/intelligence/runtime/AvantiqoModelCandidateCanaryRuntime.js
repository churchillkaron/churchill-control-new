import { createHash } from "node:crypto";
import { assertAvantiqoRunPodCertifiedImageBinding } from "@/lib/intelligence/runtime/AvantiqoRunPodCertifiedImageBinding";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_MODEL_CANDIDATE_CANARY_CONTRACT =
  "AVANTIQO_MODEL_CANDIDATE_CANARY_V1";

const MEMORY_TABLE = "intelligence_memories";
const MODEL_CANDIDATE_SCOPE = "platform_model_candidates";
const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const DEFAULT_TIMEOUT_MS = 30000;
const CANDIDATE_MODEL_PREFIX = "avantiqo-intelligence-candidate";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function candidateModelName(adapterArtifactReference) {
  const artifact = text(adapterArtifactReference, 1000);
  if (!artifact) throw new Error("AVANTIQO_CANDIDATE_ADAPTER_ARTIFACT_REQUIRED");
  const fingerprint = createHash("sha256").update(artifact).digest("hex").slice(0, 16);
  return `${CANDIDATE_MODEL_PREFIX}-${fingerprint}`;
}

function config() {
  if (!enabled(process.env.AVANTIQO_INTELLIGENCE_CANDIDATE_ENGINE_ENABLED)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CANDIDATE_ENGINE_DISABLED");
  }
  const endpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID, 160);
  const apiKey = text(process.env.RUNPOD_API_KEY, 1000);
  const managementApiKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY, 1000);
  const boundCandidateId = text(process.env.AVANTIQO_INTELLIGENCE_CANDIDATE_MODEL_CANDIDATE_ID, 160);
  if (!endpointId) throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID_REQUIRED");
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) {
    throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID_INVALID");
  }
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  if (!boundCandidateId) {
    throw new Error("AVANTIQO_INTELLIGENCE_CANDIDATE_MODEL_CANDIDATE_ID_REQUIRED");
  }
  return {
    endpointId,
    apiKey,
    managementApiKey,
    boundCandidateId,
    apiBase: `${RUNPOD_API_BASE}/${endpointId}`,
    openaiBase: `${RUNPOD_API_BASE}/${endpointId}/openai/v1`,
    timeoutMs: Math.max(
      1000,
      Number(process.env.AVANTIQO_INTELLIGENCE_CANDIDATE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    ),
  };
}

async function requestJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { message: raw };
    }
    if (!response.ok) {
      throw new Error(
        `AVANTIQO_CANDIDATE_REQUEST_FAILED:${response.status}:${text(body?.error?.message || body?.error || body?.message, 800)}`,
      );
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function loadCandidate(organizationId, candidateId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,subject,content,metadata,active,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", MODEL_CANDIDATE_SCOPE)
    .eq("id", candidateId)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function candidateEligible(row = {}) {
  const metadata = object(row.metadata);
  return Boolean(
    metadata.contract === "AVANTIQO_MODEL_IMPROVEMENT_V1" &&
      metadata.status === "PROMOTION_REVIEW_ELIGIBLE" &&
      metadata.production_model_promoted === false &&
      metadata.automatic_production_promotion === false &&
      text(metadata.adapter_artifact_reference, 1000)
  );
}

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function parseFinalMessage(response = {}) {
  const choice = response?.choices?.[0] || {};
  const message = object(choice.message);
  const raw = text(message.content, 12000);
  const closeIndex = raw.lastIndexOf("</think>");
  const openIndex = raw.indexOf("<think>");
  if (openIndex >= 0 && closeIndex < 0) {
    throw new Error("AVANTIQO_CANDIDATE_TRUNCATED_REASONING_OUTPUT");
  }
  const content = closeIndex >= 0
    ? raw.slice(closeIndex + "</think>".length).trim()
    : raw;
  if (/<think>|<\/think>/i.test(content)) {
    throw new Error("AVANTIQO_CANDIDATE_REASONING_LEAK_DETECTED");
  }
  return {
    content,
    toolCalls: list(message.tool_calls),
    reasoningSeparated: Boolean(text(message.reasoning_content || message.reasoning, 12000)) || closeIndex >= 0,
  };
}

function probeTool() {
  return {
    type: "function",
    function: {
      name: "avantiqo_candidate_probe",
      description: "Return the fixed candidate certification payload.",
      parameters: {
        type: "object",
        properties: { status: { type: "string", enum: ["ok"] } },
        required: ["status"],
        additionalProperties: false,
      },
    },
  };
}

function toolSucceeded(calls) {
  if (calls.length !== 1) return false;
  const call = calls[0] || {};
  if (text(call?.function?.name, 120) !== "avantiqo_candidate_probe") return false;
  try {
    const args = JSON.parse(text(call?.function?.arguments, 2000));
    return object(args).status === "ok";
  } catch {
    return false;
  }
}

export async function certifyAvantiqoModelCandidateCanary({
  modelCandidateId,
  approved = false,
} = {}) {
  const organizationId = learningOrganizationId();
  const candidateId = text(modelCandidateId, 160);
  if (!organizationId) throw new Error("AVANTIQO_CANDIDATE_LEARNING_ORGANIZATION_REQUIRED");
  if (!candidateId) throw new Error("AVANTIQO_CANDIDATE_ID_REQUIRED");
  if (approved !== true) throw new Error("AVANTIQO_CANDIDATE_EXPLICIT_CANARY_APPROVAL_REQUIRED");

  const candidate = await loadCandidate(organizationId, candidateId);
  if (!candidate) throw new Error("AVANTIQO_CANDIDATE_NOT_FOUND");
  if (!candidateEligible(candidate)) throw new Error("AVANTIQO_CANDIDATE_NOT_PROMOTION_REVIEW_ELIGIBLE");
  const candidateConfig = config();
  if (candidateConfig.boundCandidateId !== candidate.id) {
    throw new Error("AVANTIQO_CANDIDATE_ENDPOINT_BINDING_MISMATCH");
  }

  const certifiedImageBinding = await assertAvantiqoRunPodCertifiedImageBinding({
    component: "candidate",
    endpointId: candidateConfig.endpointId,
    managementApiKey: candidateConfig.managementApiKey,
    timeoutMs: candidateConfig.timeoutMs,
  });
  const adapterArtifactReference = text(candidate?.metadata?.adapter_artifact_reference, 1000);
  const expectedModel = candidateModelName(adapterArtifactReference);
  const startedAt = Date.now();
  const health = await requestJson(
    `${candidateConfig.apiBase}/health`,
    { method: "GET", headers: headers(candidateConfig.apiKey) },
    candidateConfig.timeoutMs,
  );
  const models = await requestJson(
    `${candidateConfig.openaiBase}/models`,
    { method: "GET", headers: headers(candidateConfig.apiKey) },
    candidateConfig.timeoutMs,
  );
  const registered = list(models?.data).some((item) => text(item?.id, 300) === expectedModel);
  if (!registered) throw new Error("AVANTIQO_CANDIDATE_EXACT_ADAPTER_MODEL_NOT_REGISTERED");

  const structured = await requestJson(
    `${candidateConfig.openaiBase}/chat/completions`,
    {
      method: "POST",
      headers: headers(candidateConfig.apiKey),
      body: JSON.stringify({
        model: expectedModel,
        messages: [
          { role: "system", content: "Return one JSON object only. Do not include markdown." },
          { role: "user", content: `Return exactly this semantic result: {"status":"ok","candidate_model":"${expectedModel}"}.` },
        ],
        temperature: 0,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    },
    candidateConfig.timeoutMs,
  );
  const structuredMessage = parseFinalMessage(structured);
  let structuredObject = null;
  try {
    structuredObject = JSON.parse(structuredMessage.content);
  } catch {
    throw new Error("AVANTIQO_CANDIDATE_STRUCTURED_OUTPUT_INVALID");
  }
  if (
    object(structuredObject).status !== "ok" ||
    object(structuredObject).candidate_model !== expectedModel
  ) {
    throw new Error("AVANTIQO_CANDIDATE_STRUCTURED_OUTPUT_CONTRACT_FAILED");
  }

  const toolResponse = await requestJson(
    `${candidateConfig.openaiBase}/chat/completions`,
    {
      method: "POST",
      headers: headers(candidateConfig.apiKey),
      body: JSON.stringify({
        model: expectedModel,
        messages: [
          { role: "system", content: "Use the required tool exactly once and do not answer in prose." },
          { role: "user", content: "Call avantiqo_candidate_probe with status ok." },
        ],
        temperature: 0,
        max_tokens: 1024,
        tools: [probeTool()],
        tool_choice: { type: "function", function: { name: "avantiqo_candidate_probe" } },
      }),
    },
    candidateConfig.timeoutMs,
  );
  const toolMessage = parseFinalMessage(toolResponse);
  if (!toolSucceeded(toolMessage.toolCalls)) {
    throw new Error("AVANTIQO_CANDIDATE_NATIVE_TOOL_CALL_FAILED");
  }

  return {
    contract: AVANTIQO_MODEL_CANDIDATE_CANARY_CONTRACT,
    status: "CANARY_READY",
    model_candidate_id: candidate.id,
    candidate_model: expectedModel,
    adapter_artifact_reference: adapterArtifactReference,
    health: {
      workers: object(health?.workers),
      jobs: object(health?.jobs),
    },
    certification: {
      endpoint_candidate_id_binding_verified: true,
      exact_candidate_image_binding_verified:
        certifiedImageBinding.exact_immutable_image_binding_verified === true,
      certified_candidate_image_reference: certifiedImageBinding.immutable_image_reference,
      certified_image_source_sha: certifiedImageBinding.certified_source_sha,
      exact_adapter_artifact_binding_verified: true,
      adapter_model_registered: true,
      structured_output_ok: true,
      native_tool_call_ok: true,
      reasoning_transport_detected:
        structuredMessage.reasoningSeparated || toolMessage.reasoningSeparated,
      latency_ms: Date.now() - startedAt,
    },
    governance: {
      explicit_canary_approval_observed: true,
      candidate_endpoint_only: true,
      certified_candidate_image_binding_verified: true,
      ordinary_provider_routing_enabled: false,
      production_endpoint_mutated: false,
      production_model_promoted: false,
      automatic_production_promotion: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export const AvantiqoModelCandidateCanaryRuntime = Object.freeze({
  contract: AVANTIQO_MODEL_CANDIDATE_CANARY_CONTRACT,
  certify: certifyAvantiqoModelCandidateCanary,
});
