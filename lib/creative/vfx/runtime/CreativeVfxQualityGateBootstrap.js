import crypto from "node:crypto";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const INSTALL_FLAG = Symbol.for("avantiqo.creative.vfx-quality-gate.v1");
const CONTRACT = "AVANTIQO_VFX_QC_V1";
const SEAL_CONTRACT = "AVANTIQO_VFX_QC_SEAL_V1";
const VFX_CONTRACT = "AVANTIQO_VFX_V1";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const REPLACEMENT_REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const PROMPT_MARKER = "AVANTIQO_VFX_QC_OUTPUT_CONTRACT_V1";

const REQUIRED_DIMENSIONS = Object.freeze([
  "tracking_lock",
  "mask_edge_integrity",
  "occlusion_depth",
  "perspective_scale",
  "temporal_stability",
  "motion_blur_depth_of_field",
  "lighting_shadow_reflection",
  "color_exposure",
  "grain_texture",
  "identity_product_geometry",
]);

const REQUIRED_TRUE = Object.freeze([
  "vfx_temporal_stability_valid",
  "tracking_lock_valid",
  "mask_edge_integrity_valid",
  "occlusion_depth_valid",
  "perspective_scale_valid",
  "motion_blur_dof_match_valid",
  "lighting_color_match_valid",
  "grain_texture_match_valid",
  "identity_product_fidelity_preserved",
]);

const REQUIRED_FALSE = Object.freeze([
  "alpha_halo_detected",
  "color_spill_detected",
  "edge_chatter_detected",
  "tracking_slip_detected",
  "scale_pumping_detected",
  "perspective_drift_detected",
  "effect_teleportation_detected",
  "effect_temporal_popping_detected",
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

function vfxContract(task = {}) {
  const input = object(task.input);
  const requirements = object(input.requirements);
  const candidate =
    input.vfx_contract ||
    requirements.vfx_contract ||
    task.metadata?.vfx_contract_data ||
    null;
  const contract = object(candidate);
  return text(contract.contract, 300) === VFX_CONTRACT ? contract : null;
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
  return `\n\n${PROMPT_MARKER}\nThis generated shot contains governed VFX. Review the ACTUAL rendered frames, not the requested intent. Return strict JSON and add vfx_qc with: contract exactly "${CONTRACT}", vfx_contract_hash exactly "${contractHash}", passed boolean, failures array, and vfx_observations object containing every dimension ${JSON.stringify(REQUIRED_DIMENSIONS)}. Also return these explicit booleans at vfx_qc root: ${REQUIRED_TRUE.map((key) => `${key}=true`).join(", ")}; ${REQUIRED_FALSE.map((key) => `${key}=false`).join(", ")}. A high overall score cannot override any failed VFX integration check. Reject tracking slip, matte/edge chatter, alpha halos, spill, scale/perspective drift, temporal popping, wrong occlusion, unmatched blur/DOF/grain/exposure/light interaction, or any unintended actor identity/product geometry change. Preserve the approved VFX intent; do not reward a different but attractive effect. Governed VFX contract: ${JSON.stringify(contract)}\n`;
}

async function bind(task = {}) {
  if (!perceptualReview(task)) return { task, applicable: false, source: null };
  const sourceId = sourceTaskId(task);
  const source = sourceId ? await ProductionTaskRuntime.get(sourceId) : null;
  const contract = source ? vfxContract(source) : null;
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
        vfx_qc: {
          contract: CONTRACT,
          vfx_contract_hash: contractHash,
        },
      },
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        vfx_qc_contract: CONTRACT,
        vfx_contract_hash: contractHash,
      },
    },
    metadata: {
      ...object(task.metadata),
      vfx_qc_contract: CONTRACT,
      vfx_qc_status: "BOUND_BEFORE_PROVIDER_REVIEW",
      vfx_contract_hash: contractHash,
      vfx_qc_prompt_extension_bound: true,
      vfx_qc_sealed: false,
    },
  });
  return { task: updated, applicable: true, source, contract, contractHash };
}

function evaluate(review = {}, source = {}) {
  const contract = vfxContract(source);
  const contractHash = contract ? hash(contract) : null;
  const evidence = rawEvidence(review);
  const qc = object(evidence.vfx_qc);
  const observations = object(qc.vfx_observations);
  const blockers = [];
  if (!contract) blockers.push("VFX_QC_SOURCE_CONTRACT_REQUIRED");
  if (text(qc.contract, 300) !== CONTRACT) blockers.push("VFX_QC_OUTPUT_CONTRACT_REQUIRED");
  if (!contractHash || text(qc.vfx_contract_hash, 300) !== contractHash) blockers.push("VFX_QC_CONTRACT_HASH_MISMATCH");
  for (const dimension of REQUIRED_DIMENSIONS) {
    const observation = object(observations[dimension]);
    if (!Object.keys(observation).length) blockers.push(`VFX_QC_DIMENSION_REQUIRED:${dimension}`);
  }
  for (const key of REQUIRED_TRUE) {
    if (qc[key] !== true) blockers.push(`VFX_QC_TRUE_EVIDENCE_REQUIRED:${key}`);
  }
  for (const key of REQUIRED_FALSE) {
    if (qc[key] !== false) blockers.push(`VFX_QC_FALSE_EVIDENCE_REQUIRED:${key}`);
  }
  if (qc.passed !== true) blockers.push("VFX_QC_PROVIDER_REVIEW_NOT_PASSED");
  if (list(qc.failures).length) blockers.push("VFX_QC_PROVIDER_FAILURES_PRESENT");
  const base = {
    contract: CONTRACT,
    version: 1,
    passed: blockers.length === 0,
    status: blockers.length ? "BLOCKED" : "PASS",
    review_task_id: review.id,
    source_generation_task_id: source.id,
    vfx_contract_hash: contractHash,
    observation_hash: Object.keys(observations).length ? hash(observations) : null,
    required_dimensions: REQUIRED_DIMENSIONS,
    required_true_evidence: REQUIRED_TRUE,
    required_false_evidence: REQUIRED_FALSE,
    blockers: unique(blockers),
    provider_calls_added: 0,
    gpu_spend_added: 0,
    policy: {
      actual_rendered_frames_are_authority: true,
      aggregate_score_cannot_override_vfx_failure: true,
      vfx_intent_cannot_replace_visual_evidence: true,
      identity_and_product_geometry_protected: true,
      temporal_edge_alpha_tracking_fail_closed: true,
    },
  };
  return { ...base, seal_contract: SEAL_CONTRACT, seal_hash: blockers.length ? null : hash(base) };
}

async function fail(review, source, evaluation) {
  if (source?.id) {
    await ProductionTaskRuntime.update(source.id, {
      status: "FAILED",
      error: `CREATIVE_VFX_QC_FAILED:${evaluation.blockers.join(",")}`,
      metadata: {
        ...object(source.metadata),
        vfx_qc_contract: CONTRACT,
        vfx_qc_failed: true,
        vfx_qc_sealed: false,
        vfx_qc_seal_hash: null,
        approved_for_downstream_after_perceptual_review: false,
        rejected_before_editing: true,
      },
      output: { ...object(source.output), vfx_qc: evaluation },
    });
  }
  return ProductionTaskRuntime.update(review.id, {
    status: "FAILED",
    error: `CREATIVE_VFX_QC_FAILED:${evaluation.blockers.join(",")}`,
    review: { ...object(review.review), required: false, approved: false, approved_by: "AVANTIQO_VFX_QC_GATE" },
    metadata: {
      ...object(review.metadata),
      automated_perceptual_validation_passed: false,
      generated_media_released_for_downstream: false,
      vfx_qc_contract: CONTRACT,
      vfx_qc_failed: true,
      vfx_qc_sealed: false,
      vfx_qc_seal_hash: null,
    },
    output: { ...object(review.output), vfx_qc: evaluation },
  });
}

async function seal(review, source, evaluation) {
  if (source?.id) {
    await ProductionTaskRuntime.update(source.id, {
      metadata: {
        ...object(source.metadata),
        vfx_qc_contract: CONTRACT,
        vfx_qc_seal_contract: SEAL_CONTRACT,
        vfx_qc_failed: false,
        vfx_qc_sealed: true,
        vfx_qc_seal_hash: evaluation.seal_hash,
        vfx_qc_observation_hash: evaluation.observation_hash,
        vfx_qc_verified_before_downstream_release: true,
      },
      output: { ...object(source.output), vfx_qc: evaluation },
    });
  }
  return ProductionTaskRuntime.update(review.id, {
    metadata: {
      ...object(review.metadata),
      vfx_qc_contract: CONTRACT,
      vfx_qc_seal_contract: SEAL_CONTRACT,
      vfx_qc_failed: false,
      vfx_qc_sealed: true,
      vfx_qc_seal_hash: evaluation.seal_hash,
      vfx_qc_observation_hash: evaluation.observation_hash,
      vfx_qc_verified_before_downstream_release: true,
    },
    output: { ...object(review.output), vfx_qc: evaluation },
  });
}

async function enforce(result, reviewId) {
  const review = await ProductionTaskRuntime.get(reviewId) || result;
  if (!perceptualReview(review) || text(review.status, 100) !== "COMPLETED") return review || result;
  const sourceId = sourceTaskId(review);
  const source = sourceId ? await ProductionTaskRuntime.get(sourceId) : null;
  if (!source || !vfxContract(source)) return review;
  const evaluation = evaluate(review, source);
  return evaluation.passed ? seal(review, source, evaluation) : fail(review, source, evaluation);
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutVfxQc = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  ProductionTaskRuntime.dispatch = async function dispatchWithVfxQualityGate(id) {
    const before = await ProductionTaskRuntime.get(id);
    if (!before || !perceptualReview(before)) return dispatchWithoutVfxQc(id);
    const prepared = await bind(before);
    const result = await dispatchWithoutVfxQc(prepared.task.id);
    return prepared.applicable ? enforce(result, prepared.task.id) : result;
  };
}

install();

export const CreativeVfxQualityGateBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  sealContract: SEAL_CONTRACT,
  bind,
  evaluate,
  enforce,
  provider_calls_added: 0,
  fail_closed: true,
});
