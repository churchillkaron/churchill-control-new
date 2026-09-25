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
function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function compactValue(value) {
  if (Array.isArray(value)) {
    return value.map(compactValue).filter((item) => item !== null && item !== undefined);
  }
  if (!value || typeof value !== "object") {
    return value === "" || value === null || value === undefined ? null : value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, child]) => [key, compactValue(child)])
      .filter(([, child]) =>
        child !== null &&
        child !== undefined &&
        (!Array.isArray(child) || child.length > 0) &&
        (typeof child !== "object" || Array.isArray(child) || Object.keys(child).length > 0)
      ),
  );
}
function compactShotForSpecialist(shot = {}, requirement = 0) {
  const base = {
    id: shot.id || null,
    purpose: shot.purpose || null,
    subject: shot.subject || null,
    action: shot.action || null,
    duration_seconds: shot.duration_seconds || null,
  };
  const byRequirement = {
    3: {
      location: shot.location || shot.scene_location || null,
      production_design: shot.production_design || null,
      props: shot.props || null,
      wardrobe: shot.wardrobe || null,
      hair_makeup: shot.hair_makeup || null,
      materials_surfaces: shot.materials_surfaces || null,
      world: shot.world || null,
    },
    4: {
      camera: shot.camera || null,
      virtual_camera_state: shot.virtual_camera_state || null,
      lighting: shot.lighting || null,
      output_spec: shot.output_spec || shot.generation?.output_spec || null,
      aerial_cinematography: shot.aerial_cinematography || null,
    },
    7: {
      camera: shot.camera || null,
      continuity: shot.continuity || null,
      continuity_invariants: shot.continuity_invariants || null,
      opening_frame: shot.opening_frame || shot.frame_plan?.opening_frame || null,
      closing_frame: shot.closing_frame || shot.frame_plan?.closing_frame || null,
      transition_in: shot.transition_in || null,
      transition_out: shot.transition_out || null,
      editorial_causality: shot.editorial_causality || null,
    },
    13: {
      location: shot.location || shot.scene_location || null,
      props: shot.props || null,
      wardrobe: shot.wardrobe || null,
      continuity: shot.continuity || null,
      continuity_invariants: shot.continuity_invariants || null,
      camera: shot.camera || null,
      lighting: shot.lighting || null,
      material_behavior: shot.material_behavior || null,
    },
    18: {
      generation: shot.generation ? {
        capability: shot.generation.capability || null,
        estimated_cost: shot.generation.estimated_cost || null,
        estimated_seconds: shot.generation.estimated_seconds || null,
      } : null,
      known_failure_modes: shot.known_failure_modes || null,
      repair_instructions: shot.repair_instructions || null,
      transition_out: shot.transition_out || null,
    },
    19: {
      performance: shot.performance || shot.performance_direction || null,
      camera: shot.camera || null,
      purpose: shot.purpose || null,
      transition_out: shot.transition_out || null,
      tempo_role: shot.tempo_role || null,
    },
  };
  return compactValue({ ...base, ...(byRequirement[Number(requirement)] || {}) });
}
function compactProductionContext(productionContext = {}, workOrder = {}) {
  const requirement = Number(workOrder.requirement || 0);
  const scenes = list(productionContext.approved_scenes).map((scene) => compactValue({
    id: scene.id || null,
    title: scene.title || null,
    purpose: scene.purpose || null,
    location: scene.location || null,
    duration_seconds: scene.duration_seconds || null,
    shots: list(scene.shots).map((shot) => compactShotForSpecialist(shot, requirement)),
  }));
  const story = object(productionContext.approved_story);
  const concept = object(productionContext.approved_concept);
  const production = object(productionContext.approved_production);
  return compactValue({
    approved_research: productionContext.approved_research ? {
      summary: productionContext.approved_research.summary || null,
      source_manifest: productionContext.approved_research.source_manifest || null,
    } : null,
    approved_story: {
      title: story.title || null,
      premise: story.premise || story.logline || null,
      narrative_arc: story.narrative_arc || story.arc || null,
      emotional_promise: story.emotional_promise || null,
    },
    approved_concept: {
      id: concept.id || null,
      title: concept.title || null,
      hook: concept.hook || null,
      message: concept.message || null,
      narrative: concept.narrative || null,
      emotional_promise: concept.emotional_promise || null,
    },
    approved_production: {
      take_strategy: production.take_strategy || null,
      duration_seconds: production.duration_seconds || null,
      currency: production.currency || null,
      reuse_policy: production.reuse_policy || null,
    },
    approved_scenes: scenes,
  });
}
function parseJsonCandidate(candidate) {
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return candidate;
  if (typeof candidate === "string") {
    try { return JSON.parse(candidate); } catch { return null; }
  }
  return null;
}
function parseOutput(result = {}) {
  const persistedResult = parseJsonCandidate(result?.usage?.metadata?.result);
  const persistedText = persistedResult?.output?.text ?? persistedResult?.text ?? null;
  const persistedOutput = parseJsonCandidate(persistedText) || parseJsonCandidate(persistedResult?.output);
  if (persistedOutput) return persistedOutput;

  const direct = parseJsonCandidate(result.output ?? result.result ?? result.data ?? null);
  const directText = parseJsonCandidate(
    direct?.text ?? direct?.answer ?? direct?.content ?? null,
  );
  if (directText) return directText;
  if (direct && !direct.raw && !direct.provider_job_id) return direct;
  const raw = direct?.raw ?? result?.output?.raw ?? null;
  const providerPayload = raw?.output ?? raw?.result ?? raw?.data ?? raw ?? null;
  const providerObject = parseJsonCandidate(providerPayload);
  const textPayload = providerObject?.text ?? providerPayload?.text ?? null;
  return parseJsonCandidate(textPayload) || providerObject || direct;
}
function normalizeSpecialistEvidence(workOrder = {}, evidence = {}) {
  const normalized = { ...object(evidence) };
  if (
    Number(workOrder?.requirement) === 8 &&
    !normalized.cloth_hair_behavior &&
    normalized.cloth_hair_dynamics_behavior
  ) {
    normalized.cloth_hair_behavior = normalized.cloth_hair_dynamics_behavior;
  }
  return normalized;
}
async function settleIfPending(result, execution_runtime, organization_id) {
  if (!result?.pending) return result;
  if (!execution_runtime?.settle) throw new Error("PRODUCTION_SPECIALIST_PENDING_SETTLEMENT_RUNTIME_REQUIRED");
  const deadline = Date.now() + 6 * 60 * 1000;
  const provider = result.provider;
  const providerJobId = result.provider_job_id || result.output?.provider_job_id;
  const usageId = result.usage?.id;
  const pricing = result.pricing || result.reservation_pricing || {};
  const credentialId = result.credential_id || null;
  if (!usageId) throw new Error("PRODUCTION_SPECIALIST_PENDING_USAGE_ID_REQUIRED");
  let current = result;
  while (current?.pending && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    current = await execution_runtime.settle({
      organization_id,
      provider,
      provider_job_id: providerJobId,
      usage_id: usageId,
      pricing,
      credential_id: credentialId,
    });
  }
  if (current?.pending) throw new Error("PRODUCTION_SPECIALIST_PROVIDER_SETTLEMENT_TIMEOUT");
  if (current?.failed || current?.success === false) {
    throw new Error(current?.error || "PRODUCTION_SPECIALIST_PROVIDER_EXECUTION_FAILED");
  }
  return current;
}
function executionPrompt({ work_order, production_context }) {
  const tasteMemoryInstruction = Number(work_order?.requirement) === 20
    ? " For Creative Taste Memory specifically: weakest_link_patterns, reference_differences, and advisory_learning must each be non-empty and grounded in the supplied active concept, tribunal verdict, or mission constraints. governance_boundary must explicitly state that taste memory is ADVISORY ONLY and CANNOT/MUST NOT override approved creative governance or make production decisions."
    : "";
  const takeStrategyInstruction = Number(work_order?.requirement) === 19
    ? " For Take Strategy specifically: insert_variants MUST be non-null and non-empty. If dedicated inserts are required, return concrete insert options grounded in the approved shots. If no dedicated insert is justified, return an explicit object such as {required:false,rationale:\"...\",coverage_source:\"...\"} grounded in the approved coverage. Never return null, empty string, empty array, or empty object for insert_variants."
    : "";
  return JSON.stringify({
    contract: CREATIVE_PRODUCTION_SPECIALIST_EXECUTION_CONTRACT,
    instruction:
      "Act only as the assigned film-production specialist workstream. Return one JSON object containing every required output key with concrete evidence. Every required_outputs key MUST appear directly at the TOP LEVEL of that JSON object. Do NOT wrap the required outputs inside a required_outputs object or any other container. Use the required_outputs key names EXACTLY as provided; never rename an output to a specialist role name or synonym. Do not create media, call media providers, alter governance, approve release, or invent evidence. If evidence is insufficient, return the strongest supported partial result and identify uncertainty inside the relevant output values." + tasteMemoryInstruction + takeStrategyInstruction,
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
    production_context: compactProductionContext(production_context, work_order),
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

  const initialResult = await execution_runtime.execute({
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
      execution_lane: "deep",
      infrastructure_policy: "local_only",
      local_compute_required: true,
      max_output_tokens: 6000,
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
  });
  const result = await settleIfPending(initialResult, execution_runtime, organization_id);
  const parsedEvidence = parseOutput(result);
  if (!parsedEvidence) throw new Error("PRODUCTION_SPECIALIST_JSON_EVIDENCE_REQUIRED");
  const evidence = normalizeSpecialistEvidence(work_order, parsedEvidence);
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
