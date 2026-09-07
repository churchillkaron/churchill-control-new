import crypto from "node:crypto";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const INSTALL_FLAG = Symbol.for("avantiqo.creative.simulation-quality-gate.v1");
const CONTRACT = "AVANTIQO_SIMULATION_QC_V1";
const SEAL_CONTRACT = "AVANTIQO_SIMULATION_QC_SEAL_V1";
const SIMULATION_CONTRACT = "AVANTIQO_SIMULATION_V1";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const REPLACEMENT_REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const PROMPT_MARKER = "AVANTIQO_SIMULATION_QC_OUTPUT_CONTRACT_V1";

const REQUIRED_DIMENSIONS = Object.freeze([
  "causal_trigger_and_initial_state",
  "gravity_and_external_forces",
  "mass_scale_and_material_response",
  "collisions_and_constraints",
  "boundary_conditions",
  "temporal_state_evolution",
  "environment_coupling",
  "solver_stability_observable",
  "class_specific_dynamics",
  "continuity_and_settling",
]);

const REQUIRED_TRUE = Object.freeze([
  "simulation_causal_valid",
  "gravity_force_response_valid",
  "mass_scale_material_valid",
  "collision_response_valid",
  "boundary_conditions_valid",
  "temporal_state_continuity_valid",
  "environment_coupling_valid",
  "solver_stability_valid",
  "class_specific_dynamics_valid",
  "simulation_settle_or_exit_valid",
]);

const REQUIRED_FALSE = Object.freeze([
  "simulation_teleportation_detected",
  "frame_state_reset_detected",
  "collision_tunneling_detected",
  "interpenetration_detected",
  "weightless_motion_detected",
  "unexplained_energy_gain_detected",
  "source_or_emitter_drift_detected",
  "topology_popping_detected",
  "solver_jitter_detected",
  "material_property_drift_detected",
  "unintended_geometry_change_detected",
  "unintended_identity_change_detected",
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
  return [...new Set(list(values).flat(Infinity).map((value) => text(value, 500)).filter(Boolean))];
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

function simulationContract(task = {}) {
  const input = object(task.input);
  const requirements = object(input.requirements);
  const candidate =
    input.simulation_contract ||
    requirements.simulation_contract ||
    task.metadata?.simulation_contract_data ||
    null;
  const contract = object(candidate);
  return text(contract.contract, 300) === SIMULATION_CONTRACT ? contract : null;
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

function promptExtension(contract, contractHash) {
  return `\n\n${PROMPT_MARKER}\nThis generated shot contains governed physical simulation. Review the ACTUAL rendered frames and judge observable physics, not how attractive the result is and not the written intent. Return strict JSON and add simulation_qc with: contract exactly "${CONTRACT}", simulation_contract_hash exactly "${contractHash}", passed boolean, failures array, and simulation_observations object containing every dimension ${JSON.stringify(REQUIRED_DIMENSIONS)}. Also return these explicit booleans at simulation_qc root: ${REQUIRED_TRUE.map((key) => `${key}=true`).join(", ")}; ${REQUIRED_FALSE.map((key) => `${key}=false`).join(", ")}. A high aggregate visual score cannot override failed physics. Reject any effect that teleports or resets state between frames; tunnels through colliders; interpenetrates; behaves weightlessly; gains energy without a cause; drifts away from its emitter/source; changes topology or material properties arbitrarily; jitters; ignores gravity, boundaries, friction, viscosity, stiffness, collisions, attachments or causal forces; or alters protected identity/product geometry outside the specifically authorized deformation/fracture. For fluids require plausible volume/free-surface behavior; for pyro require source-coupled advection/buoyancy and no boiling noise; for cloth/soft bodies require stable attachment/deformation/collision response; for rigid bodies/destruction require plausible mass, inertia, contact, constraints, fracture trigger and debris momentum; for particles/granular/hair require source, lifetime/root attachment, drag/collision and settling continuity as applicable. Governed simulation contract: ${JSON.stringify(contract)}\n`;
}

async function bind(task = {}) {
  if (!perceptualReview(task)) return { task, applicable: false, source: null };
  const sourceId = sourceTaskId(task);
  const source = sourceId ? await ProductionTaskRuntime.get(sourceId) : null;
  const contract = source ? simulationContract(source) : null;
  if (!source || !contract) return { task, applicable: false, source };
  const contractHash = hash(contract);
  const currentPrompt = text(task.input?.prompt);
  const currentProviderPrompt = text(task.input?.provider_prompt);
  const extension = currentPrompt.includes(PROMPT_MARKER)
    ? ""
    : promptExtension(contract, contractHash);
  const updated = await ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      prompt: `${currentPrompt}${extension}`,
      provider_prompt: `${currentProviderPrompt || currentPrompt}${extension}`,
      requirements: {
        ...object(task.input?.requirements),
        simulation_qc: {
          contract: CONTRACT,
          simulation_contract_hash: contractHash,
        },
      },
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        simulation_qc_contract: CONTRACT,
        simulation_contract_hash: contractHash,
      },
    },
    metadata: {
      ...object(task.metadata),
      simulation_qc_contract: CONTRACT,
      simulation_qc_status: "BOUND_BEFORE_PROVIDER_REVIEW",
      simulation_contract_hash: contractHash,
      simulation_qc_prompt_extension_bound: true,
      simulation_qc_sealed: false,
    },
  });
  return { task: updated, applicable: true, source, contract, contractHash };
}

function evaluate(review = {}, source = {}) {
  const contract = simulationContract(source);
  const contractHash = contract ? hash(contract) : null;
  const evidence = rawEvidence(review);
  const qc = object(evidence.simulation_qc);
  const observations = object(qc.simulation_observations);
  const blockers = [];
  if (!contract) blockers.push("SIMULATION_QC_SOURCE_CONTRACT_REQUIRED");
  if (text(qc.contract, 300) !== CONTRACT) blockers.push("SIMULATION_QC_OUTPUT_CONTRACT_REQUIRED");
  if (!contractHash || text(qc.simulation_contract_hash, 300) !== contractHash) blockers.push("SIMULATION_QC_CONTRACT_HASH_MISMATCH");
  for (const dimension of REQUIRED_DIMENSIONS) {
    const observation = object(observations[dimension]);
    if (!Object.keys(observation).length) blockers.push(`SIMULATION_QC_DIMENSION_REQUIRED:${dimension}`);
  }
  for (const key of REQUIRED_TRUE) {
    if (qc[key] !== true) blockers.push(`SIMULATION_QC_TRUE_EVIDENCE_REQUIRED:${key}`);
  }
  for (const key of REQUIRED_FALSE) {
    if (qc[key] !== false) blockers.push(`SIMULATION_QC_FALSE_EVIDENCE_REQUIRED:${key}`);
  }
  if (qc.passed !== true) blockers.push("SIMULATION_QC_PROVIDER_REVIEW_NOT_PASSED");
  if (list(qc.failures).length) blockers.push("SIMULATION_QC_PROVIDER_FAILURES_PRESENT");
  const base = {
    contract: CONTRACT,
    version: 1,
    passed: blockers.length === 0,
    status: blockers.length ? "BLOCKED" : "PASS",
    review_task_id: review.id,
    source_generation_task_id: source.id,
    simulation_contract_hash: contractHash,
    observation_hash: Object.keys(observations).length ? hash(observations) : null,
    required_dimensions: REQUIRED_DIMENSIONS,
    required_true_evidence: REQUIRED_TRUE,
    required_false_evidence: REQUIRED_FALSE,
    blockers: unique(blockers),
    provider_calls_added: 0,
    gpu_spend_added: 0,
    policy: {
      actual_rendered_frames_are_authority: true,
      aggregate_score_cannot_override_physics_failure: true,
      causal_frame_to_frame_state_required: true,
      collision_and_environment_coupling_fail_closed: true,
      material_scale_and_force_drift_forbidden: true,
      protected_identity_and_product_geometry_preserved: true,
    },
  };
  return { ...base, seal_contract: SEAL_CONTRACT, seal_hash: blockers.length ? null : hash(base) };
}

async function fail(review, source, evaluation) {
  if (source?.id) {
    await ProductionTaskRuntime.update(source.id, {
      status: "FAILED",
      error: `CREATIVE_SIMULATION_QC_FAILED:${evaluation.blockers.join(",")}`,
      metadata: {
        ...object(source.metadata),
        simulation_qc_contract: CONTRACT,
        simulation_qc_failed: true,
        simulation_qc_sealed: false,
        simulation_qc_seal_hash: null,
        approved_for_downstream_after_perceptual_review: false,
        rejected_before_editing: true,
      },
      output: { ...object(source.output), simulation_qc: evaluation },
    });
  }
  return ProductionTaskRuntime.update(review.id, {
    status: "FAILED",
    error: `CREATIVE_SIMULATION_QC_FAILED:${evaluation.blockers.join(",")}`,
    review: { ...object(review.review), required: false, approved: false, approved_by: "AVANTIQO_SIMULATION_QC_GATE" },
    metadata: {
      ...object(review.metadata),
      automated_perceptual_validation_passed: false,
      generated_media_released_for_downstream: false,
      simulation_qc_contract: CONTRACT,
      simulation_qc_failed: true,
      simulation_qc_sealed: false,
      simulation_qc_seal_hash: null,
    },
    output: { ...object(review.output), simulation_qc: evaluation },
  });
}

async function seal(review, source, evaluation) {
  if (source?.id) {
    await ProductionTaskRuntime.update(source.id, {
      metadata: {
        ...object(source.metadata),
        simulation_qc_contract: CONTRACT,
        simulation_qc_seal_contract: SEAL_CONTRACT,
        simulation_qc_failed: false,
        simulation_qc_sealed: true,
        simulation_qc_seal_hash: evaluation.seal_hash,
        simulation_qc_observation_hash: evaluation.observation_hash,
        simulation_qc_verified_before_downstream_release: true,
      },
      output: { ...object(source.output), simulation_qc: evaluation },
    });
  }
  return ProductionTaskRuntime.update(review.id, {
    metadata: {
      ...object(review.metadata),
      simulation_qc_contract: CONTRACT,
      simulation_qc_seal_contract: SEAL_CONTRACT,
      simulation_qc_failed: false,
      simulation_qc_sealed: true,
      simulation_qc_seal_hash: evaluation.seal_hash,
      simulation_qc_observation_hash: evaluation.observation_hash,
      simulation_qc_verified_before_downstream_release: true,
    },
    output: { ...object(review.output), simulation_qc: evaluation },
  });
}

async function enforce(result, reviewId) {
  const review = await ProductionTaskRuntime.get(reviewId) || result;
  if (!perceptualReview(review) || text(review.status, 100) !== "COMPLETED") return review || result;
  const sourceId = sourceTaskId(review);
  const source = sourceId ? await ProductionTaskRuntime.get(sourceId) : null;
  if (!source || !simulationContract(source)) return review;
  const evaluation = evaluate(review, source);
  return evaluation.passed ? seal(review, source, evaluation) : fail(review, source, evaluation);
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutSimulationQc = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  ProductionTaskRuntime.dispatch = async function dispatchWithSimulationQualityGate(id) {
    const before = await ProductionTaskRuntime.get(id);
    if (!before || !perceptualReview(before)) return dispatchWithoutSimulationQc(id);
    const prepared = await bind(before);
    const result = await dispatchWithoutSimulationQc(prepared.task.id);
    return prepared.applicable ? enforce(result, prepared.task.id) : result;
  };
}

install();

export const CreativeSimulationQualityGateBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  sealContract: SEAL_CONTRACT,
  bind,
  evaluate,
  enforce,
  provider_calls_added: 0,
  fail_closed: true,
});
