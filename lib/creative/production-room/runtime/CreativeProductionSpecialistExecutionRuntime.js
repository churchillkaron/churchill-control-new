import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
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
function parseOutput(result = {}) {
  const candidate = result.output ?? result.result ?? result.data ?? null;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return candidate;
  if (typeof candidate === "string") {
    try { return JSON.parse(candidate); } catch { return null; }
  }
  return null;
}
function executionPrompt({ work_order, production_context }) {
  return JSON.stringify({
    contract: CREATIVE_PRODUCTION_SPECIALIST_EXECUTION_CONTRACT,
    instruction:
      "Act only as the assigned film-production specialist workstream. Return one JSON object containing every required output key with concrete evidence. Do not create media, call media providers, alter governance, approve release, or invent evidence. If evidence is insufficient, return the strongest supported partial result and identify uncertainty inside the relevant output values.",
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

  const result = await execution_runtime.execute({
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
      media_generation_allowed: false,
      provider_prompt_persisted: false,
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
