import crypto from "node:crypto";

import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const INSTALL_FLAG = Symbol.for("avantiqo.creative.world-consistency-quality-gate.v1");
const CONTRACT = "AVANTIQO_WORLD_CONSISTENCY_QC_V1";
const SEAL_CONTRACT = "AVANTIQO_WORLD_CONSISTENCY_QC_SEAL_V1";
const WORLD_CONTRACT = "AVANTIQO_WORLD_CONSISTENCY_V1";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const REPLACEMENT_REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const PROMPT_MARKER = "AVANTIQO_WORLD_CONSISTENCY_QC_OUTPUT_CONTRACT_V1";

const REQUIRED_DIMENSIONS = Object.freeze([
  "location_identity",
  "spatial_geography",
  "architecture_geometry",
  "production_design",
  "props_set_dressing",
  "materials_surfaces",
  "signage_readable_text",
  "lighting_sources_direction",
  "time_weather_atmosphere",
  "background_population",
  "scale_perspective",
  "reflections_shadows_occlusion",
]);

const REQUIRED_TRUE = Object.freeze([
  "world_identity_preserved",
  "spatial_geography_valid",
  "architecture_geometry_valid",
  "production_design_valid",
  "props_set_dressing_valid",
  "materials_surfaces_valid",
  "lighting_world_valid",
  "scale_perspective_valid",
  "reflection_shadow_occlusion_valid",
]);

const REQUIRED_FALSE = Object.freeze([
  "environment_geometry_drift_detected",
  "architecture_mutation_detected",
  "prop_teleportation_detected",
  "set_dressing_drift_detected",
  "material_surface_drift_detected",
  "signage_text_drift_detected",
  "unmotivated_lighting_reset_detected",
  "unmotivated_time_weather_reset_detected",
  "background_population_teleportation_detected",
  "scale_perspective_drift_detected",
  "reflection_shadow_geometry_conflict_detected",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 100000) {
  return String(value ?? "").trim().slice(0, limit);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value ?? null))).digest("hex");
}

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map((value) => text(value, 600)).filter(Boolean))];
}

function perceptualReview(task = {}) {
  return text(task.metadata?.contract, 300) === REVIEW_CONTRACT ||
    text(task.metadata?.repair_payload_contract, 300) === REPLACEMENT_REVIEW_CONTRACT;
}

function sourceTaskId(review = {}) {
  return text(
    review.metadata?.source_generation_task_id ||
    review.metadata?.repaired_source_task_id ||
    review.input?.provider_parameters?.source_generation_task_id ||
    list(review.depends_on)[0],
    500,
  ) || null;
}

function worldContract(task = {}) {
  const input = object(task.input);
  const requirements = object(input.requirements);
  const candidate =
    input.world_consistency_contract ||
    requirements.world_consistency_contract ||
    task.metadata?.world_consistency_contract_data ||
    null;
  const contract = object(candidate);
  return text(contract.contract, 300) === WORLD_CONTRACT ? contract : null;
}

function outputValue(output = {}) {
  return output?.output?.output || output?.output || output || {};
}

function rawEvidence(review = {}) {
  const root = object(outputValue(review.output));
  const candidate = root.result || root.review || root.validation || root;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    return { ...root, ...object(candidate) };
  }
  const source = text(candidate);
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first < 0 || last <= first) return {};
  try {
    const parsed = JSON.parse(source.slice(first, last + 1));
    return { ...root, ...object(parsed), ...object(parsed.result || parsed) };
  } catch {
    return {};
  }
}

function previousStateContext(review = {}) {
  const context = object(review.input?.requirements?.continuity_qc_context);
  return {
    previous_state_hash: context.previous_state_hash || null,
    previous_approved_cinematic_state: context.previous_approved_cinematic_state || null,
    continuity_reset_authorized: context.continuity_reset_authorized === true,
    continuity_reset_reason: context.continuity_reset_reason || null,
  };
}

function promptExtension(contract, contractHash, previous) {
  return `\n\n${PROMPT_MARKER}\nWorld consistency is a hard release gate. Inspect the ACTUAL rendered frames. A camera angle change does not authorize the world itself to mutate. Compare location identity, geography, architecture, set dressing, props, materials, readable signage/text, lighting sources/direction, time/weather/atmosphere, background population, scale/perspective, reflections, shadows and occlusion against the governed world contract and any supplied previous approved cinematic state. Return strict JSON and add world_consistency_qc with: contract exactly "${CONTRACT}", world_contract_hash exactly "${contractHash}", passed boolean, failures array, world_observations containing every dimension ${JSON.stringify(REQUIRED_DIMENSIONS)}, explicit booleans ${REQUIRED_TRUE.map((key) => `${key}=true`).join(", ")}, and ${REQUIRED_FALSE.map((key) => `${key}=false`).join(", ")}. A beautiful or high-scoring shot still FAILS if the venue geometry, doors/windows/walls, furniture layout, props, signs, material identity, light direction, weather/time state, crowd/background, reflections/shadows or object scale silently changes. Only an explicit authorized world change in the contract may alter locked state. Do not infer hidden geometry from wishful intent; judge visible evidence. Governed world contract: ${JSON.stringify(contract)}. Previous approved world context: ${JSON.stringify(previous)}\n`;
}

async function bind(task = {}) {
  if (!perceptualReview(task)) return { task, applicable: false, source: null };
  const sourceId = sourceTaskId(task);
  const source = sourceId ? await ProductionTaskRuntime.get(sourceId) : null;
  const contract = source ? worldContract(source) : null;
  if (!source || !contract) return { task, applicable: false, source };
  const contractHash = hash(contract);
  const previous = previousStateContext(task);
  const currentPrompt = text(task.input?.prompt);
  const currentProviderPrompt = text(task.input?.provider_prompt);
  const extension = currentPrompt.includes(PROMPT_MARKER)
    ? ""
    : promptExtension(contract, contractHash, previous);
  const updated = await ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      prompt: `${currentPrompt}${extension}`,
      provider_prompt: `${currentProviderPrompt || currentPrompt}${extension}`,
      requirements: {
        ...object(task.input?.requirements),
        world_consistency_qc: {
          contract: CONTRACT,
          world_contract_hash: contractHash,
          previous_state_hash: previous.previous_state_hash,
        },
      },
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        world_consistency_qc_contract: CONTRACT,
        world_contract_hash: contractHash,
      },
    },
    metadata: {
      ...object(task.metadata),
      world_consistency_qc_contract: CONTRACT,
      world_consistency_qc_status: "BOUND_BEFORE_PROVIDER_REVIEW",
      world_consistency_contract_hash: contractHash,
      world_consistency_qc_prompt_extension_bound: true,
      world_consistency_qc_sealed: false,
    },
  });
  return { task: updated, applicable: true, source, contract, contractHash };
}

function evaluate(review = {}, source = {}) {
  const contract = worldContract(source);
  const contractHash = contract ? hash(contract) : null;
  const evidence = rawEvidence(review);
  const qc = object(evidence.world_consistency_qc);
  const observations = object(qc.world_observations);
  const blockers = [];
  if (!contract) blockers.push("WORLD_QC_SOURCE_CONTRACT_REQUIRED");
  if (text(qc.contract, 300) !== CONTRACT) blockers.push("WORLD_QC_OUTPUT_CONTRACT_REQUIRED");
  if (!contractHash || text(qc.world_contract_hash, 300) !== contractHash) blockers.push("WORLD_QC_CONTRACT_HASH_MISMATCH");
  for (const dimension of REQUIRED_DIMENSIONS) {
    const observation = object(observations[dimension]);
    if (!Object.keys(observation).length) {
      blockers.push(`WORLD_QC_DIMENSION_REQUIRED:${dimension}`);
      continue;
    }
    if (observation.passed !== true || text(observation.evidence, 1600).length < 8) {
      blockers.push(`WORLD_QC_DIMENSION_FAILED:${dimension}`);
    }
  }
  for (const key of REQUIRED_TRUE) {
    if (qc[key] !== true) blockers.push(`WORLD_QC_TRUE_EVIDENCE_REQUIRED:${key}`);
  }
  for (const key of REQUIRED_FALSE) {
    if (qc[key] !== false) blockers.push(`WORLD_QC_FALSE_EVIDENCE_REQUIRED:${key}`);
  }
  if (qc.passed !== true) blockers.push("WORLD_QC_PROVIDER_REVIEW_NOT_PASSED");
  if (list(qc.failures).length) blockers.push("WORLD_QC_PROVIDER_FAILURES_PRESENT");
  const base = {
    contract: CONTRACT,
    version: 1,
    passed: blockers.length === 0,
    status: blockers.length ? "BLOCKED" : "PASS",
    review_task_id: review.id,
    source_generation_task_id: source.id,
    world_id: contract?.world_id || null,
    world_contract_hash: contractHash,
    observation_hash: Object.keys(observations).length ? hash(observations) : null,
    required_dimensions: REQUIRED_DIMENSIONS,
    required_true_evidence: REQUIRED_TRUE,
    required_false_evidence: REQUIRED_FALSE,
    blockers: unique(blockers),
    provider_calls_added: 0,
    gpu_spend_added: 0,
    policy: {
      actual_rendered_frames_are_authority: true,
      aggregate_score_cannot_override_world_failure: true,
      camera_change_does_not_authorize_world_mutation: true,
      previous_reviewed_world_state_is_authority_when_available: true,
      silent_architecture_geography_prop_signage_lighting_drift_forbidden: true,
    },
  };
  return { ...base, seal_contract: SEAL_CONTRACT, seal_hash: blockers.length ? null : hash(base) };
}

async function fail(review, source, evaluation) {
  const repairInstructions = evaluation.blockers.map((code) =>
    `Repair only the world-consistency defect ${code}. Preserve the approved actor identity, performance, camera intent, timing, unaffected environment state, VFX and simulation behavior.`,
  );
  if (source?.id) {
    await ProductionTaskRuntime.update(source.id, {
      status: "FAILED",
      error: `CREATIVE_WORLD_CONSISTENCY_QC_FAILED:${evaluation.blockers.join(",")}`,
      metadata: {
        ...object(source.metadata),
        world_consistency_qc_contract: CONTRACT,
        world_consistency_qc_failed: true,
        world_consistency_qc_sealed: false,
        world_consistency_qc_seal_hash: null,
        approved_for_downstream_after_perceptual_review: false,
        rejected_before_editing: true,
      },
      output: { ...object(source.output), world_consistency_qc: evaluation },
    });
  }
  const existingValidation = object(
    review.output?.perceptual_validation ||
    review.output?.output?.perceptual_validation,
  );
  const existingEvidence = object(existingValidation.evidence);
  return ProductionTaskRuntime.update(review.id, {
    status: "FAILED",
    error: `CREATIVE_WORLD_CONSISTENCY_QC_FAILED:${evaluation.blockers.join(",")}`,
    review: { ...object(review.review), required: false, approved: false, approved_by: "AVANTIQO_WORLD_CONSISTENCY_QC_GATE" },
    metadata: {
      ...object(review.metadata),
      automated_perceptual_validation_passed: false,
      generated_media_released_for_downstream: false,
      world_consistency_qc_contract: CONTRACT,
      world_consistency_qc_failed: true,
      world_consistency_qc_sealed: false,
      world_consistency_qc_seal_hash: null,
    },
    output: {
      ...object(review.output),
      world_consistency_qc: evaluation,
      perceptual_validation: {
        ...existingValidation,
        passed: false,
        evidence: {
          ...existingEvidence,
          failures: unique([list(existingEvidence.failures), evaluation.blockers]),
          repair_instructions: unique([list(existingEvidence.repair_instructions), repairInstructions]),
          world_consistency_qc: false,
        },
      },
    },
  });
}

async function seal(review, source, evaluation) {
  if (source?.id) {
    await ProductionTaskRuntime.update(source.id, {
      metadata: {
        ...object(source.metadata),
        world_consistency_qc_contract: CONTRACT,
        world_consistency_qc_seal_contract: SEAL_CONTRACT,
        world_consistency_qc_failed: false,
        world_consistency_qc_sealed: true,
        world_consistency_qc_seal_hash: evaluation.seal_hash,
        world_consistency_qc_observation_hash: evaluation.observation_hash,
        world_consistency_qc_verified_before_downstream_release: true,
      },
      output: { ...object(source.output), world_consistency_qc: evaluation },
    });
  }
  return ProductionTaskRuntime.update(review.id, {
    metadata: {
      ...object(review.metadata),
      world_consistency_qc_contract: CONTRACT,
      world_consistency_qc_seal_contract: SEAL_CONTRACT,
      world_consistency_qc_failed: false,
      world_consistency_qc_sealed: true,
      world_consistency_qc_seal_hash: evaluation.seal_hash,
      world_consistency_qc_observation_hash: evaluation.observation_hash,
      world_consistency_qc_verified_before_downstream_release: true,
    },
    output: { ...object(review.output), world_consistency_qc: evaluation },
  });
}

async function enforce(result, reviewId) {
  const review = await ProductionTaskRuntime.get(reviewId) || result;
  if (!perceptualReview(review) || text(review.status, 100) !== "COMPLETED") return review || result;
  const sourceId = sourceTaskId(review);
  const source = sourceId ? await ProductionTaskRuntime.get(sourceId) : null;
  if (!source || !worldContract(source)) return review;
  const evaluation = evaluate(review, source);
  return evaluation.passed ? seal(review, source, evaluation) : fail(review, source, evaluation);
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutWorldQc = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  ProductionTaskRuntime.dispatch = async function dispatchWithWorldConsistencyQualityGate(id) {
    const before = await ProductionTaskRuntime.get(id);
    if (!before || !perceptualReview(before)) return dispatchWithoutWorldQc(id);
    const prepared = await bind(before);
    const result = await dispatchWithoutWorldQc(prepared.task.id);
    return prepared.applicable ? enforce(result, prepared.task.id) : result;
  };
}

install();

export const CreativeWorldConsistencyQualityGateBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  sealContract: SEAL_CONTRACT,
  bind,
  evaluate,
  enforce,
  provider_calls_added: 0,
  fail_closed: true,
});
