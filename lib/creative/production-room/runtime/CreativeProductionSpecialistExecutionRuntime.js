import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import { executeApprovedPreproductionReasoning } from "./CreativePreproductionSpendApprovalRuntime.js";
import {
  CREATIVE_PRODUCTION_WORK_ORDER_CONTRACT,
  completeProductionWorkOrder,
} from "./CreativeProductionWorkOrderRuntime.js";

export const CREATIVE_PRODUCTION_SPECIALIST_EXECUTION_CONTRACT =
  "CREATIVE_PRODUCTION_SPECIALIST_EXECUTION_V1";

function text(value) {
  return String(value ?? "").trim();
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  const source = value.trim();
  if (!source) return null;
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}
function parseOutput(result = {}) {
  const direct = parseJsonObject(result.result ?? result.data);
  if (direct) return direct;
  const output = result.output;
  if (typeof output === "string") return parseJsonObject(output);
  const textCandidates = [
    output?.text,
    output?.output?.text,
    output?.raw?.text,
    output?.raw?.output?.text,
    output?.raw?.output?.output?.text,
    result?.usage?.metadata?.provider_result?.output?.text,
    result?.usage?.metadata?.provider_result?.output?.output?.text,
  ];
  for (const value of textCandidates) {
    const parsed = parseJsonObject(value);
    if (parsed) return parsed;
  }
  if (output && typeof output === "object" && !Array.isArray(output)) return output;
  return null;
}
function parseUsageEvidence(usage = {}) {
  const candidates = [
    usage?.metadata?.provider_result?.output?.text,
    usage?.metadata?.provider_result?.text,
    usage?.metadata?.result?.output?.text,
    usage?.metadata?.result?.text,
  ];
  for (const candidate of candidates) {
    if (!text(candidate)) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}
function matchingWorkOrderUsage(rows, creative_project_id, work_order, statuses = []) {
  const allowed = new Set(statuses.map((value) => text(value).toUpperCase()));
  return rows
    .filter((usage) => !allowed.size || allowed.has(text(usage?.status).toUpperCase()))
    .filter((usage) => text(usage?.metadata?.creative_project_id) === text(creative_project_id))
    .filter((usage) => text(usage?.metadata?.operation).toUpperCase() === `PRODUCTION_WORKSTREAM_${work_order.requirement}`)
    .filter((usage) => text(usage?.metadata?.production_room_stage).toUpperCase() === text(work_order.stage_id).toUpperCase())
    .filter((usage) => text(usage?.metadata?.workstream_id) === text(work_order.workstream_id))
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
}
async function recoverPendingWorkOrder({ organization_id, creative_project_id, work_order }) {
  const rows = await UsageRuntime.organization(organization_id);
  const match = matchingWorkOrderUsage(rows, creative_project_id, work_order, ["PENDING"])[0] || null;
  if (!match) return null;
  const providerJobId = text(match.provider_request_id || match.metadata?.provider_job_id);
  if (!text(match.provider) || !providerJobId) return null;
  let settled = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    settled = await ServiceExecutionRuntime.settle({
      organization_id,
      provider: match.provider,
      provider_job_id: providerJobId,
      usage_id: match.id,
      pricing: match.metadata?.reservation_pricing || {},
      credential_id: match.metadata?.credential_id || null,
      started_at: match.execution_started_at || match.created_at || null,
      provider_status_input: { model: match.provider_model || match.metadata?.model || null },
      metadata: {
        ...(match.metadata || {}),
        recovered_pending_specialist_usage: true,
      },
    });
    if (!settled?.pending) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!settled || settled.pending || settled.failed) return null;
  const usage = settled.usage || await UsageRuntime.get(match.id);
  const evidence = parseOutput(settled) || parseUsageEvidence(usage);
  if (!evidence) return null;
  const completion = completeProductionWorkOrder({ work_order, evidence });
  if (completion.passed !== true) return null;
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_SPECIALIST_EXECUTION_CONTRACT,
    passed: true,
    stage_id: work_order.stage_id,
    requirement: work_order.requirement,
    workstream_id: work_order.workstream_id,
    evidence,
    completion,
    usage,
    billing: settled.billing || null,
    provider: settled.provider || usage?.provider || null,
    model: settled.model || usage?.provider_model || usage?.metadata?.model || null,
    recovered_pending_usage: true,
    media_generation_executed: false,
    provider_media_execution_authority: false,
  });
}
async function recoverSettledWorkOrder({ organization_id, creative_project_id, work_order }) {
  const rows = await UsageRuntime.organization(organization_id);
  const match = matchingWorkOrderUsage(rows, creative_project_id, work_order, ["SUCCESS"])[0] || null;
  if (!match) return null;
  const evidence = parseUsageEvidence(match);
  if (!evidence) return null;
  const completion = completeProductionWorkOrder({ work_order, evidence });
  if (completion.passed !== true) return null;
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_SPECIALIST_EXECUTION_CONTRACT,
    passed: completion.passed === true,
    stage_id: work_order.stage_id,
    requirement: work_order.requirement,
    workstream_id: work_order.workstream_id,
    evidence,
    completion,
    usage: match,
    billing: null,
    provider: match.provider || null,
    model: match.provider_model || match.metadata?.model || null,
    recovered_settled_usage: true,
    media_generation_executed: false,
    provider_media_execution_authority: false,
  });
}

function executionPrompt({ work_order, production_context }) {
  return JSON.stringify({
    contract: CREATIVE_PRODUCTION_SPECIALIST_EXECUTION_CONTRACT,
    instruction:
      "Act only as the assigned film-production specialist workstream. Return one JSON object containing every required output key with substantive evidence. Placeholder values such as evidence_missing, unknown, not provided, none, n/a or equivalent are invalid. Use the supplied approved research and approved master-plan evidence; do not invent sources or facts. For research/scouting, source_manifest must contain at least two distinct approved evidence references when available. Do not create media, call media providers, alter governance, approve release, or invent evidence. If evidence is genuinely insufficient, return the strongest supported partial result and identify the exact uncertainty inside the relevant output values.",
    work_order: {
      stage_id: work_order.stage_id,
      requirement: work_order.requirement,
      workstream_id: work_order.workstream_id,
      owner: work_order.owner,
      specialists: work_order.specialists,
      required_outputs: work_order.required_outputs,
      dependencies: work_order.dependencies,
      context_digest: work_order.context_digest,
    },
    production_context: object(production_context),
  });
}

function assertWorkOrder(workOrder = {}) {
  if (workOrder.contract !== CREATIVE_PRODUCTION_WORK_ORDER_CONTRACT) {
    throw new Error("PRODUCTION_SPECIALIST_WORK_ORDER_REQUIRED");
  }
  if (workOrder.status !== "READY") {
    throw new Error(`PRODUCTION_SPECIALIST_WORK_ORDER_NOT_READY:${workOrder.status || "UNKNOWN"}`);
  }
  if (workOrder.provider_execution_authority !== false || workOrder.media_generation_authority !== false) {
    throw new Error("PRODUCTION_SPECIALIST_MEDIA_AUTHORITY_FORBIDDEN");
  }
}
export async function executeProductionSpecialistWorkOrder({
  organization_id,
  creative_project_id,
  work_order,
  production_context = {},
  execution_runtime = ServiceExecutionRuntime,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  assertWorkOrder(work_order);
  if (!execution_runtime?.execute) throw new Error("PRODUCTION_SPECIALIST_EXECUTION_RUNTIME_REQUIRED");

  const recovered = await recoverSettledWorkOrder({ organization_id, creative_project_id, work_order });
  if (recovered) return recovered;
  const recoveredPending = await recoverPendingWorkOrder({ organization_id, creative_project_id, work_order });
  if (recoveredPending) return recoveredPending;

  const result = await executeApprovedPreproductionReasoning({
    organization_id,
    creative_project_id,
    operation: `PRODUCTION_WORKSTREAM_${work_order.requirement}`,
    execution_runtime,
    execution_input: {
    organization_id,
    service_id: "ai.reasoning.execute",
    provider_id: "avantiqo-intelligence",
    category: "CREATIVE_PRODUCTION_SPECIALIST",
    provider_policy: {
      allowed_providers: ["avantiqo-intelligence"],
      allow_owned_reasoning_fallback: false,
    },
    input: {
      prompt: executionPrompt({ work_order, production_context }),
      quantity: 1,
      max_output_tokens: 12000,
      response_format: { type: "json_object" },
    },
    metadata: {
      module: "CREATIVE",
      operation: `PRODUCTION_WORKSTREAM_${work_order.requirement}`,
      creative_project_id,
      production_room_stage: work_order.stage_id,
      workstream_id: work_order.workstream_id,
      workstream_context_digest: work_order.context_digest || null,
      media_generation_allowed: false,
      provider_prompt_persisted: false,
    },
    },
  });
  const evidence = parseOutput(result);
  if (!evidence) throw new Error("PRODUCTION_SPECIALIST_JSON_EVIDENCE_REQUIRED");
  const completion = completeProductionWorkOrder({
    work_order,
    evidence,
  });

  return Object.freeze({
    contract: CREATIVE_PRODUCTION_SPECIALIST_EXECUTION_CONTRACT,
    passed: completion.passed === true,
    stage_id: work_order.stage_id,
    requirement: work_order.requirement,
    workstream_id: work_order.workstream_id,
    evidence,
    completion,
    usage: result.usage || null,
    billing: result.billing || null,
    provider: result.provider || null,
    model: result.model || null,
    media_generation_executed: false,
    provider_media_execution_authority: false,
  });
}

export const CreativeProductionSpecialistExecutionRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_SPECIALIST_EXECUTION_CONTRACT,
  execute: executeProductionSpecialistWorkOrder,
});
