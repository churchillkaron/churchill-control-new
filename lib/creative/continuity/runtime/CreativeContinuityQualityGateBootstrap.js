import crypto from "node:crypto";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as ShotRepository
from "@/lib/creative/shots/repositories/ShotRepository";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.continuity-quality-gate.v1",
);
const GATE_CONTRACT = "AVANTIQO_CONTINUITY_QC_GATE_V1";
const SEAL_CONTRACT = "AVANTIQO_CONTINUITY_QC_SEAL_V1";
const OBSERVATION_CONTRACT = "GENERATED_MEDIA_CONTINUITY_OBSERVATION_V1";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const REPLACEMENT_REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const STATE_CONTRACT = "CREATIVE_CINEMATIC_STATE_MEMORY_V1";
const ENDPOINT_CONTRACT = "CREATIVE_CINEMA_ENDPOINT_FIDELITY_V1";
const PROMPT_MARKER = "AVANTIQO_CONTINUITY_QC_OUTPUT_CONTRACT_V1";

const ALWAYS_DIMENSIONS = Object.freeze([
  "opening_state",
  "progression",
  "closing_state",
  "environment",
  "lighting",
  "camera_path",
  "screen_direction",
  "action_match",
  "geometry_stability",
  "artifact_stability",
]);

const HUMAN_DIMENSIONS = Object.freeze([
  "performance",
  "body_motion",
  "hands_limbs",
  "eyeline",
]);

const IDENTITY_DIMENSIONS = Object.freeze([
  "identity",
  "wardrobe",
  "hair_makeup",
]);

const PRODUCT_DIMENSIONS = Object.freeze([
  "product_prop",
]);

const AERIAL_DIMENSIONS = Object.freeze([
  "aerial_motion",
  "horizon_spatial_stability",
]);

const REQUIRED_TRUE_ALWAYS = Object.freeze([
  "requested_environment_correct",
  "requested_camera_correct",
  "continuity_valid",
  "physics_valid",
  "camera_path_valid",
  "screen_direction_valid",
  "action_match_valid",
]);

const REQUIRED_TRUE_HUMAN = Object.freeze([
  "person_count_correct",
  "anatomy_valid",
  "hand_integrity_valid",
  "limb_topology_valid",
  "body_proportions_preserved",
  "natural_pose",
  "performance_valid",
  "eyeline_valid",
]);

const REQUIRED_TRUE_IDENTITY = Object.freeze([
  "identity_preserved",
  "face_geometry_preserved",
  "identity_consistent_across_frames",
]);

const REQUIRED_FALSE_HUMAN = Object.freeze([
  "extra_limbs_detected",
  "missing_limbs_detected",
  "malformed_hands_detected",
  "duplicate_subject_detected",
  "face_identity_drift_detected",
  "body_identity_drift_detected",
]);

const REQUIRED_FALSE_TEMPORAL = Object.freeze([
  "camera_teleportation_detected",
  "temporal_warping_detected",
  "environment_instability_detected",
]);

const LOCOMOTION = /\b(?:walk|walking|run|running|step|steps|enter|enters|exit|exits|cross|crosses|approach|approaches|follow|follows|move|moves)\b/i;
const CONTACT = /\b(?:reach|reaches|grab|grabs|hold|holds|touch|touches|pick|picks|place|places|press|presses|pour|pours|open|opens|close|closes|use|uses|write|writes|cut|cuts|stir|stirs|lift|lifts|carry|carries|drag|drags|push|pushes|pull|pulls|hand|hands|give|gives|take|takes)\b/i;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 10000) {
  return String(value ?? "").trim().slice(0, limit);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value ?? null)))
    .digest("hex");
}

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map((value) =>
    text(typeof value === "string" ? value : value?.code || value?.message || value, 500),
  ).filter(Boolean))];
}

function hasData(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(text(value));
}

function capability(task = {}) {
  return text(task.capability || task.service_code || task.service_id, 300)
    .toLowerCase();
}

function cinemaTask(task = {}) {
  return capability(task).startsWith("ai.video.");
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

function outputValue(output = {}) {
  return output?.output?.output || output?.output || output || {};
}

function rawReviewEvidence(review = {}) {
  const root = object(outputValue(review.output));
  const candidate = root.result || root.review || root.validation || root;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    return {
      ...root,
      ...object(candidate),
    };
  }
  const source = text(candidate, 100000);
  if (!source) return {};
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first < 0 || last <= first) return {};
  try {
    const parsed = JSON.parse(source.slice(first, last + 1));
    return {
      ...root,
      ...object(parsed),
      ...object(parsed.result || parsed),
    };
  } catch {
    return {};
  }
}

function expectedContract(review = {}) {
  return object(
    review.input?.requirements?.expected_contract ||
    review.metadata?.requirements?.expected_contract,
  );
}

function currentSequence(shot = {}) {
  return finite(shot.shot_number) ??
    finite(shot.metadata?.master_plan_shot_index) ??
    finite(shot.metadata?.shot_index);
}

function previousSameSceneShot(shots = [], current = {}) {
  const sameScene = list(shots).filter((shot) =>
    text(shot.scene_id, 500) === text(current.scene_id, 500),
  );
  if (sameScene.length <= 1) return null;
  const ordered = [...sameScene].sort((left, right) => {
    const a = currentSequence(left);
    const b = currentSequence(right);
    if (a !== null && b !== null && a !== b) return a - b;
    return text(left.id, 500).localeCompare(text(right.id, 500));
  });
  const index = ordered.findIndex((shot) => text(shot.id, 500) === text(current.id, 500));
  return index > 0 ? ordered[index - 1] : null;
}

function continuityReset(shot = {}) {
  const continuity = object(shot.continuity);
  const reset = continuity.reset === true || continuity.continuity_reset === true;
  const reason = text(
    continuity.reset_reason ||
    continuity.continuity_reset_reason ||
    continuity.change_reason,
    600,
  );
  return {
    authorized: reset && reason.length >= 12,
    requested: reset,
    reason: reason || null,
  };
}

function stateMemory(shot = {}) {
  const state = object(shot.metadata?.cinematic_state_memory);
  return text(state.contract, 300) === STATE_CONTRACT ? state : null;
}

function plannedContinuityState(shot = {}) {
  const shotBible = object(shot.metadata?.shot_bible_source);
  return {
    contract: "CREATIVE_PLANNED_CONTINUITY_STATE_V1",
    shot_id: shot.id || null,
    scene_id: shot.scene_id || null,
    identity: {
      actors: list(shot.actors),
      requirements: object(
        shot.identity_requirements || shotBible.identity_requirements,
      ),
      wardrobe: list(shot.wardrobe || shotBible.wardrobe),
      hair_makeup: list(shot.hair_makeup || shotBible.hair_makeup),
    },
    product: {
      products: list(shot.products),
    },
    environment: {
      location: object(shot.location),
      production_design: object(shot.production_design),
      props: list(shot.props || shotBible.props),
    },
    spatial: {
      continuity: object(shot.continuity),
      camera: object(shot.camera),
      lighting: object(shot.lighting),
      frame_plan: object(shot.frame_plan),
    },
  };
}

function compactPreviousState(state = {}) {
  return {
    contract: state.contract || null,
    shot_id: state.shot_id || null,
    scene_id: state.scene_id || null,
    state_hash: state.state_hash || null,
    chain_hash: state.chain_hash || null,
    identity: state.identity || {},
    product: state.product || {},
    environment: state.environment || {},
    spatial: state.spatial || {},
    visual_confirmation: state.visual_confirmation || null,
  };
}

function qcContext({ review, source, shot, previousShot, previousState, reset } = {}) {
  const expected = expectedContract(review);
  const previous = previousState ? compactPreviousState(previousState) : null;
  const previousHash = previous
    ? previous.state_hash || hash(previous)
    : null;
  const contextBase = {
    contract: GATE_CONTRACT,
    current_review_task_id: review.id,
    current_source_task_id: source.id,
    current_shot_id: shot.id,
    current_scene_id: shot.scene_id || null,
    previous_shot_id: previousShot?.id || null,
    previous_state_authority: previousState
      ? text(previousState.contract, 300) === STATE_CONTRACT
        ? "REVIEWED_AUTHORITATIVE_STATE"
        : "PLANNED_NON_GENERATED_STATE"
      : "NO_PRIOR_SHOT",
    previous_state_hash: previousHash,
    previous_chain_hash: previousState?.chain_hash || null,
    previous_approved_cinematic_state: previous,
    continuity_reset_authorized: reset.authorized === true,
    continuity_reset_reason: reset.reason || null,
    endpoint_fidelity_required:
      expected.first_last_frame_conditioning_expected === true,
    person_expected: expected.person_expected === true,
    identity_expected: expected.identity_expected === true,
    product_expected: expected.product_expected === true,
    aerial_expected:
      source.metadata?.aerial_cinematography_verified_before_dispatch === true ||
      source.metadata?.camera_grammar_aerial_candidate === true,
    provider_calls_added_by_qc: 0,
  };
  return {
    ...contextBase,
    expected_contract_hash: hash({
      expected_contract: expected,
      continuity_context: contextBase,
    }),
  };
}

function continuityPromptExtension(context = {}) {
  return `

${PROMPT_MARKER}
Continuity is a hard release gate, not a style preference. Compare the actual generated video across opening, progression and closing states against the immutable expected contract and, when supplied, the previous approved cinematic state. Do not infer success from attractiveness or from a high aggregate score. Every required dimension must be visibly verified.

Return the normal review JSON plus ALL of these top-level boolean fields:
"hand_integrity_valid", "limb_topology_valid", "body_proportions_preserved", "face_geometry_preserved", "identity_consistent_across_frames", "natural_pose", "performance_valid", "camera_path_valid", "screen_direction_valid", "eyeline_valid", "action_match_valid", "aerial_motion_valid", "extra_limbs_detected", "missing_limbs_detected", "malformed_hands_detected", "duplicate_subject_detected", "face_identity_drift_detected", "body_identity_drift_detected", "foot_sliding_detected", "object_contact_discontinuity_detected", "object_geometry_drift_detected", "camera_teleportation_detected", "temporal_warping_detected", "environment_instability_detected".

Also return exactly this additional object:
"continuity_observations": {
  "contract": "${OBSERVATION_CONTRACT}",
  "expected_contract_hash": "${text(context.expected_contract_hash, 200)}",
  "previous_state_hash": ${context.previous_state_hash ? `"${text(context.previous_state_hash, 200)}"` : "null"},
  "dimensions": {
    "opening_state": {"applicable": true, "passed": true, "evidence": "specific visible evidence"},
    "progression": {"applicable": true, "passed": true, "evidence": "specific visible evidence"},
    "closing_state": {"applicable": true, "passed": true, "evidence": "specific visible evidence"},
    "environment": {"applicable": true, "passed": true, "evidence": "specific visible evidence"},
    "lighting": {"applicable": true, "passed": true, "evidence": "specific visible evidence"},
    "camera_path": {"applicable": true, "passed": true, "evidence": "specific visible evidence"},
    "screen_direction": {"applicable": true, "passed": true, "evidence": "specific visible evidence"},
    "action_match": {"applicable": true, "passed": true, "evidence": "specific visible evidence"},
    "geometry_stability": {"applicable": true, "passed": true, "evidence": "specific visible evidence"},
    "artifact_stability": {"applicable": true, "passed": true, "evidence": "specific visible evidence"},
    "performance": {"applicable": ${context.person_expected === true}, "passed": true, "evidence": "specific visible evidence or not applicable"},
    "body_motion": {"applicable": ${context.person_expected === true}, "passed": true, "evidence": "specific visible evidence or not applicable"},
    "hands_limbs": {"applicable": ${context.person_expected === true}, "passed": true, "evidence": "specific visible evidence or not applicable"},
    "eyeline": {"applicable": ${context.person_expected === true}, "passed": true, "evidence": "specific visible evidence or not applicable"},
    "identity": {"applicable": ${context.identity_expected === true}, "passed": true, "evidence": "specific visible evidence or not applicable"},
    "wardrobe": {"applicable": ${context.identity_expected === true}, "passed": true, "evidence": "specific visible evidence or not applicable"},
    "hair_makeup": {"applicable": ${context.identity_expected === true}, "passed": true, "evidence": "specific visible evidence or not applicable"},
    "product_prop": {"applicable": ${context.product_expected === true}, "passed": true, "evidence": "specific visible evidence or not applicable"},
    "aerial_motion": {"applicable": ${context.aerial_expected === true}, "passed": true, "evidence": "specific visible evidence or not applicable"},
    "horizon_spatial_stability": {"applicable": ${context.aerial_expected === true}, "passed": true, "evidence": "specific visible evidence or not applicable"},
    "endpoint_handoff": {"applicable": ${context.endpoint_fidelity_required === true}, "passed": true, "evidence": "specific visible evidence or not applicable"}
  }
}

Rules for this continuity object:
- If a dimension is required by the expected contract, set applicable=true. Never hide a failure by marking it not applicable.
- Every applicable dimension needs concrete visible evidence and passed=false if there is any ambiguity, drift, contradiction, discontinuity or unreadable evidence.
- When a previous approved state is supplied, explicitly compare identity, wardrobe, hair/makeup, products/props, location, lighting, screen direction, eyeline, action handoff and spatial geography to that state.
- Human motion must preserve five-finger hand topology when visible, complete limbs, plausible balance and weight transfer, causal contact, stable facial identity and physically continuous pose transitions.
- Locomotion with foot sliding is failure. Object interaction with broken contact or changing object geometry is failure. Camera teleportation, temporal warping and unstable environment geometry are failure.
- Aerial motion, when applicable, must preserve the approved flight path, subject relationship, horizon/roll intent, geography and handoff direction.
- For first/last-frame-conditioned video, endpoint_handoff is required in this review and is additionally verified by a separate deterministic pixel gate after perceptual review.

CONTINUITY QC CONTEXT
${JSON.stringify(context)}
`;
}

function requiredDimensions(context = {}) {
  return unique([
    ALWAYS_DIMENSIONS,
    context.person_expected === true ? HUMAN_DIMENSIONS : [],
    context.identity_expected === true ? IDENTITY_DIMENSIONS : [],
    context.product_expected === true ? PRODUCT_DIMENSIONS : [],
    context.aerial_expected === true ? AERIAL_DIMENSIONS : [],
    context.endpoint_fidelity_required === true ? ["endpoint_handoff"] : [],
  ]);
}

function dimensionDecision(observation = {}, name, required) {
  const dimension = object(observation.dimensions?.[name]);
  if (!Object.keys(dimension).length) {
    return {
      name,
      required,
      passed: !required,
      code: required ? `CONTINUITY_QC_DIMENSION_MISSING:${name}` : null,
    };
  }
  if (dimension.applicable === true) {
    const evidence = text(dimension.evidence, 1200);
    const passed = dimension.passed === true && evidence.length >= 8;
    return {
      name,
      required,
      applicable: true,
      passed,
      evidence,
      code: passed ? null : `CONTINUITY_QC_DIMENSION_FAILED:${name}`,
    };
  }
  const passed = !required && dimension.passed !== false;
  return {
    name,
    required,
    applicable: false,
    passed,
    evidence: text(dimension.evidence, 1200) || null,
    code: passed ? null : `CONTINUITY_QC_REQUIRED_DIMENSION_NOT_APPLICABLE:${name}`,
  };
}

function booleanDecision(evidence = {}, key, expectedValue = true) {
  const present = Object.prototype.hasOwnProperty.call(evidence, key);
  const actual = present && typeof evidence[key] === "boolean"
    ? evidence[key]
    : null;
  const passed = present && actual === expectedValue;
  return {
    key,
    expected: expectedValue,
    actual,
    present,
    passed,
    code: passed ? null : `CONTINUITY_QC_EVIDENCE_${expectedValue ? "TRUE" : "FALSE"}_REQUIRED:${key}`,
  };
}

function sourceAction(expected = {}) {
  return [
    expected.action,
    expected.performance,
    expected.performance_contract?.physical_action,
    expected.performance_contract?.action_progression,
  ].map((value) => text(value, 2400)).filter(Boolean).join(" ");
}

function evaluateRawReview({ review, source } = {}) {
  const evidence = rawReviewEvidence(review);
  const expected = expectedContract(review);
  const context = object(review.input?.requirements?.continuity_qc_context);
  const observation = object(evidence.continuity_observations);
  const blockers = [];

  if (text(context.contract, 300) !== GATE_CONTRACT) {
    blockers.push("CONTINUITY_QC_CONTEXT_REQUIRED");
  }
  if (text(observation.contract, 300) !== OBSERVATION_CONTRACT) {
    blockers.push("CONTINUITY_QC_OBSERVATION_CONTRACT_REQUIRED");
  }
  if (
    text(context.expected_contract_hash, 300) &&
    text(observation.expected_contract_hash, 300) !==
      text(context.expected_contract_hash, 300)
  ) {
    blockers.push("CONTINUITY_QC_EXPECTED_CONTRACT_HASH_MISMATCH");
  }
  if (
    text(context.previous_state_hash, 300) &&
    text(observation.previous_state_hash, 300) !==
      text(context.previous_state_hash, 300)
  ) {
    blockers.push("CONTINUITY_QC_PREVIOUS_STATE_HASH_MISMATCH");
  }

  const required = requiredDimensions(context);
  const dimensionNames = unique([
    Object.keys(object(observation.dimensions)),
    required,
  ]);
  const dimensions = dimensionNames.map((name) =>
    dimensionDecision(observation, name, required.includes(name)),
  );
  blockers.push(...dimensions.filter((item) => !item.passed).map((item) => item.code));

  const trueKeys = unique([
    REQUIRED_TRUE_ALWAYS,
    context.person_expected === true ? REQUIRED_TRUE_HUMAN : [],
    context.identity_expected === true ? REQUIRED_TRUE_IDENTITY : [],
    context.aerial_expected === true ? ["aerial_motion_valid"] : [],
  ]);
  const falseKeys = unique([
    REQUIRED_FALSE_TEMPORAL,
    context.person_expected === true ? REQUIRED_FALSE_HUMAN : [],
  ]);
  const action = sourceAction(expected);
  if (LOCOMOTION.test(action)) falseKeys.push("foot_sliding_detected");
  if (CONTACT.test(action)) {
    falseKeys.push("object_contact_discontinuity_detected");
    falseKeys.push("object_geometry_drift_detected");
  }

  const booleans = [
    ...trueKeys.map((key) => booleanDecision(evidence, key, true)),
    ...unique(falseKeys).map((key) => booleanDecision(evidence, key, false)),
  ];
  blockers.push(...booleans.filter((item) => !item.passed).map((item) => item.code));

  if (evidence.passed !== true) blockers.push("CONTINUITY_QC_PROVIDER_REVIEW_NOT_PASSED");
  if (list(evidence.failures).length) blockers.push("CONTINUITY_QC_PROVIDER_FAILURES_PRESENT");

  const base = {
    contract: GATE_CONTRACT,
    version: 1,
    passed: blockers.length === 0,
    status: blockers.length ? "BLOCKED" : "PASS",
    review_task_id: review.id,
    source_generation_task_id: source?.id || null,
    shot_id: source?.shot_id || expected.shot_id || null,
    scene_id: source?.scene_id || expected.scene_id || null,
    observation_contract: observation.contract || null,
    observation_hash: Object.keys(observation).length ? hash(observation) : null,
    expected_contract_hash: context.expected_contract_hash || null,
    previous_shot_id: context.previous_shot_id || null,
    previous_state_authority: context.previous_state_authority || null,
    previous_state_hash: context.previous_state_hash || null,
    previous_chain_hash: context.previous_chain_hash || null,
    continuity_reset_authorized: context.continuity_reset_authorized === true,
    required_dimensions: required,
    dimension_decisions: dimensions,
    hard_evidence_decisions: booleans,
    endpoint_fidelity_required: context.endpoint_fidelity_required === true,
    endpoint_fidelity_contract: context.endpoint_fidelity_required === true
      ? ENDPOINT_CONTRACT
      : null,
    endpoint_fidelity_verified_by_separate_deterministic_gate:
      context.endpoint_fidelity_required === true,
    blockers: unique(blockers),
    provider_calls_added: 0,
    gpu_spend_added: 0,
    policy: {
      prior_same_scene_reviewed_state_bound_before_review: true,
      missing_prior_generated_state_holds_review_before_provider_call: true,
      aggregate_score_cannot_override_continuity_failure: true,
      explicit_evidence_required_for_hard_temporal_checks: true,
      human_anatomy_identity_performance_checks_fail_closed: true,
      continuity_observation_hash_bound_to_expected_contract: true,
      source_generation_not_released_without_qc_seal: true,
    },
  };
  return {
    ...base,
    seal_contract: SEAL_CONTRACT,
    seal_hash: blockers.length ? null : hash(base),
  };
}

async function previousContext({ review, source, shot } = {}) {
  const shots = await ShotRepository.list({
    organization_id: source.organization_id,
    creative_project_id: source.creative_project_id,
  });
  const previousShot = previousSameSceneShot(shots, shot);
  const reset = continuityReset(shot);
  if (!previousShot || reset.authorized) {
    return {
      previousShot,
      previousState: null,
      reset,
      waiting: false,
    };
  }

  const approvedState = stateMemory(previousShot);
  if (approvedState) {
    return {
      previousShot,
      previousState: approvedState,
      reset,
      waiting: false,
    };
  }

  const tasks = await ProductionTaskRuntime.list({
    organization_id: source.organization_id,
    creative_project_id: source.creative_project_id,
  });
  const priorGeneratedCinemaTasks = tasks.filter((candidate) =>
    text(candidate.shot_id, 500) === text(previousShot.id, 500) &&
    cinemaTask(candidate) &&
    !perceptualReview(candidate) &&
    !text(candidate.metadata?.superseded_by_repair_task_id, 500)
  );
  if (priorGeneratedCinemaTasks.length) {
    return {
      previousShot,
      previousState: null,
      reset,
      waiting: true,
      waitingTaskIds: priorGeneratedCinemaTasks.map((candidate) => candidate.id),
    };
  }

  return {
    previousShot,
    previousState: plannedContinuityState(previousShot),
    reset,
    waiting: false,
  };
}

async function bindReviewQc(task = {}) {
  const sourceId = sourceTaskId(task);
  const source = sourceId ? await ProductionTaskRuntime.get(sourceId) : null;
  if (!source || !cinemaTask(source) || !source.shot_id) {
    return { task, source, waiting: false, applicable: false };
  }
  const shot = await ShotRepository.get(source.shot_id);
  if (!shot) {
    const failed = await ProductionTaskRuntime.update(task.id, {
      status: "FAILED",
      error: "CONTINUITY_QC_SHOT_NOT_FOUND",
      metadata: {
        ...object(task.metadata),
        continuity_qc_contract: GATE_CONTRACT,
        continuity_qc_sealed: false,
        generated_media_released_for_downstream: false,
      },
    });
    return { task: failed, source, waiting: false, applicable: true, failed: true };
  }
  if (
    text(shot.organization_id, 500) !== text(source.organization_id, 500) ||
    text(shot.creative_project_id, 500) !== text(source.creative_project_id, 500)
  ) {
    const failed = await ProductionTaskRuntime.update(task.id, {
      status: "FAILED",
      error: "CONTINUITY_QC_SHOT_SCOPE_MISMATCH",
      metadata: {
        ...object(task.metadata),
        continuity_qc_contract: GATE_CONTRACT,
        continuity_qc_sealed: false,
        generated_media_released_for_downstream: false,
      },
    });
    return { task: failed, source, waiting: false, applicable: true, failed: true };
  }

  const previous = await previousContext({ review: task, source, shot });
  if (previous.waiting) {
    const waiting = await ProductionTaskRuntime.update(task.id, {
      metadata: {
        ...object(task.metadata),
        continuity_qc_contract: GATE_CONTRACT,
        continuity_qc_status: "WAITING_FOR_PREVIOUS_APPROVED_STATE",
        continuity_qc_waiting_for_previous_shot_id: previous.previousShot?.id || null,
        continuity_qc_waiting_for_task_ids: previous.waitingTaskIds || [],
        continuity_qc_provider_call_blocked_while_waiting: true,
        continuity_qc_sealed: false,
        generated_media_released_for_downstream: false,
      },
    });
    return { task: waiting, source, waiting: true, applicable: true };
  }

  const context = qcContext({
    review: task,
    source,
    shot,
    previousShot: previous.previousShot,
    previousState: previous.previousState,
    reset: previous.reset,
  });
  const extension = continuityPromptExtension(context);
  const currentPrompt = text(task.input?.prompt, 100000);
  const currentProviderPrompt = text(task.input?.provider_prompt, 100000);
  const prompt = currentPrompt.includes(PROMPT_MARKER)
    ? currentPrompt
    : `${currentPrompt}${extension}`;
  const providerPrompt = currentProviderPrompt.includes(PROMPT_MARKER)
    ? currentProviderPrompt
    : `${currentProviderPrompt || currentPrompt}${extension}`;
  const expected = expectedContract(task);
  const updated = await ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      prompt,
      provider_prompt: providerPrompt,
      requirements: {
        ...object(task.input?.requirements),
        expected_contract: {
          ...expected,
          continuity_qc: {
            contract: GATE_CONTRACT,
            expected_contract_hash: context.expected_contract_hash,
            previous_shot_id: context.previous_shot_id,
            previous_state_hash: context.previous_state_hash,
            previous_chain_hash: context.previous_chain_hash,
            previous_state_authority: context.previous_state_authority,
            continuity_reset_authorized: context.continuity_reset_authorized,
            endpoint_fidelity_required: context.endpoint_fidelity_required,
          },
          previous_approved_cinematic_state:
            context.previous_approved_cinematic_state,
        },
        continuity_qc_context: context,
      },
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        continuity_qc_contract: GATE_CONTRACT,
        continuity_observation_contract: OBSERVATION_CONTRACT,
        continuity_qc_expected_contract_hash: context.expected_contract_hash,
        continuity_qc_previous_state_hash: context.previous_state_hash,
      },
    },
    metadata: {
      ...object(task.metadata),
      continuity_qc_contract: GATE_CONTRACT,
      continuity_qc_status: "BOUND_BEFORE_PROVIDER_REVIEW",
      continuity_qc_previous_shot_id: context.previous_shot_id,
      continuity_qc_previous_state_hash: context.previous_state_hash,
      continuity_qc_previous_state_authority: context.previous_state_authority,
      continuity_qc_expected_contract_hash: context.expected_contract_hash,
      continuity_qc_prompt_extension_bound: true,
      continuity_qc_checked_before_provider_review: true,
      continuity_qc_sealed: false,
    },
  });
  return {
    task: updated,
    source,
    waiting: false,
    applicable: true,
    context,
  };
}

function qcFailureValidation(review = {}, evaluation = {}) {
  const existing = object(
    review.output?.perceptual_validation ||
    review.output?.output?.perceptual_validation,
  );
  const evidence = object(existing.evidence);
  const failures = unique([
    evidence.failures,
    existing.validation_failures,
    evaluation.blockers,
  ]);
  const repairInstructions = failures.map((failure) =>
    `Correct only the release-blocking continuity/QC requirement ${failure}; preserve the approved Shot Bible, identity, camera intent, timing, endpoints, neighboring shots and every unaffected requirement.`,
  );
  return {
    ...existing,
    passed: false,
    checks: {
      ...object(existing.checks),
      continuity_qc: false,
    },
    evidence: {
      ...evidence,
      failures,
      repair_instructions: unique([
        evidence.repair_instructions,
        existing.repair_instructions,
        repairInstructions,
      ]),
      continuity_qc: evaluation,
    },
    validation_failures: failures,
    repair_instructions: unique([
      existing.repair_instructions,
      repairInstructions,
    ]),
    continuity_qc_contract: GATE_CONTRACT,
  };
}

async function rejectRawReview(review = {}, source = {}, evaluation = {}) {
  const validation = qcFailureValidation(review, evaluation);
  if (source?.id) {
    await ProductionTaskRuntime.update(source.id, {
      status: "FAILED",
      error: `CREATIVE_CONTINUITY_QC_FAILED:${evaluation.blockers.join(",")}`,
      metadata: {
        ...object(source.metadata),
        perceptual_validation_failed: true,
        continuity_qc_contract: GATE_CONTRACT,
        continuity_qc_sealed: false,
        continuity_qc_failed: true,
        continuity_qc_seal_hash: null,
        approved_for_downstream_after_perceptual_review: false,
        rejected_before_editing: true,
      },
      output: {
        ...object(source.output),
        continuity_qc: evaluation,
        perceptual_validation: validation,
      },
    });
  }
  return ProductionTaskRuntime.update(review.id, {
    status: "FAILED",
    error: `CREATIVE_CONTINUITY_QC_FAILED:${evaluation.blockers.join(",")}`,
    review: {
      ...object(review.review),
      required: false,
      approved: false,
      approved_by: "AVANTIQO_CONTINUITY_QC_GATE",
    },
    metadata: {
      ...object(review.metadata),
      automated_perceptual_validation_passed: false,
      generated_media_released_for_downstream: false,
      continuity_qc_contract: GATE_CONTRACT,
      continuity_qc_sealed: false,
      continuity_qc_failed: true,
      continuity_qc_seal_hash: null,
    },
    output: {
      ...object(review.output),
      continuity_qc: evaluation,
      perceptual_validation: validation,
    },
  });
}

async function sealRawReview(review = {}, source = {}, evaluation = {}) {
  if (source?.id) {
    await ProductionTaskRuntime.update(source.id, {
      metadata: {
        ...object(source.metadata),
        continuity_qc_contract: GATE_CONTRACT,
        continuity_qc_seal_contract: SEAL_CONTRACT,
        continuity_qc_sealed: true,
        continuity_qc_failed: false,
        continuity_qc_seal_hash: evaluation.seal_hash,
        continuity_qc_observation_hash: evaluation.observation_hash,
        continuity_qc_previous_state_hash: evaluation.previous_state_hash,
        continuity_qc_previous_chain_hash: evaluation.previous_chain_hash,
        continuity_qc_verified_before_downstream_release: true,
      },
      output: {
        ...object(source.output),
        continuity_qc: evaluation,
      },
    });
  }
  return ProductionTaskRuntime.update(review.id, {
    metadata: {
      ...object(review.metadata),
      continuity_qc_contract: GATE_CONTRACT,
      continuity_qc_seal_contract: SEAL_CONTRACT,
      continuity_qc_sealed: true,
      continuity_qc_failed: false,
      continuity_qc_seal_hash: evaluation.seal_hash,
      continuity_qc_observation_hash: evaluation.observation_hash,
      continuity_qc_previous_state_hash: evaluation.previous_state_hash,
      continuity_qc_previous_chain_hash: evaluation.previous_chain_hash,
      continuity_qc_verified_before_downstream_release: true,
    },
    output: {
      ...object(review.output),
      continuity_qc: evaluation,
    },
  });
}

async function enforceRawReview(result, reviewId) {
  const review = await ProductionTaskRuntime.get(reviewId) || result;
  if (!perceptualReview(review)) return review || result;
  if (text(review.status, 100) !== "COMPLETED") return review;
  const sourceId = sourceTaskId(review);
  const source = sourceId ? await ProductionTaskRuntime.get(sourceId) : null;
  if (!source || !cinemaTask(source)) return review;
  const evaluation = evaluateRawReview({ review, source });
  return evaluation.passed
    ? sealRawReview(review, source, evaluation)
    : rejectRawReview(review, source, evaluation);
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutContinuityQc = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithContinuityQualityGate(id) {
    const before = await ProductionTaskRuntime.get(id);
    if (!before || !perceptualReview(before)) {
      return dispatchWithoutContinuityQc(id);
    }

    const prepared = await bindReviewQc(before);
    if (prepared.failed || prepared.waiting) return prepared.task;
    const result = await dispatchWithoutContinuityQc(prepared.task.id);
    return prepared.applicable
      ? enforceRawReview(result, prepared.task.id)
      : result;
  };
}

install();

export const CreativeContinuityQualityGateBootstrap = Object.freeze({
  installed: true,
  contract: GATE_CONTRACT,
  sealContract: SEAL_CONTRACT,
  observationContract: OBSERVATION_CONTRACT,
  bindReviewQc,
  evaluateRawReview,
  enforceRawReview,
  continuityPromptExtension,
  provider_calls_added: 0,
  fail_closed: true,
});
