import crypto from "node:crypto";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as ShotRepository
from "@/lib/creative/shots/repositories/ShotRepository";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.cinematic-state-memory-bootstrap.v1",
);
const STATE_CONTRACT = "CREATIVE_CINEMATIC_STATE_MEMORY_V1";
const LEDGER_CONTRACT = "CREATIVE_CINEMATIC_STATE_LEDGER_V1";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const REPLACEMENT_REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const ENDPOINT_CONTRACT = "CREATIVE_CINEMA_ENDPOINT_FIDELITY_V1";
const MAX_RELEVANT_STATES = 3;
const MAX_HASH_HISTORY = 24;
const PROMPT_KEYS = new Set([
  "prompt",
  "provider_prompt",
  "negative_prompt",
  "visual_prompt",
  "video_prompt",
  "image_prompt",
  "generation_prompt",
  "instructions",
  "instruction",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : fallback;
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

function normalizedKey(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .toLowerCase();
}

function bounded(value, depth = 0) {
  if (depth > 4) return null;
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((child) => bounded(child, depth + 1));
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string") return value.slice(0, 360);
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PROMPT_KEYS.has(normalizedKey(key)))
      .slice(0, 20)
      .map(([key, child]) => [key, bounded(child, depth + 1)]),
  );
}

function unique(values = []) {
  return [...new Set(list(values).map(text).filter(Boolean))];
}

function capability(task = {}) {
  return text(task.capability || task.service_code || task.service_id)
    .toLowerCase();
}

function cinemaTask(task = {}) {
  return capability(task).startsWith("ai.video.");
}

function perceptualReview(task = {}) {
  return text(task.metadata?.contract) === REVIEW_CONTRACT ||
    text(task.metadata?.repair_payload_contract) === REPLACEMENT_REVIEW_CONTRACT;
}

function sourceTaskId(review = {}) {
  return text(
    review.metadata?.source_generation_task_id ||
    review.metadata?.repaired_source_task_id ||
    review.input?.provider_parameters?.source_generation_task_id ||
    list(review.depends_on)[0],
  ) || null;
}

function outputValue(output = {}) {
  return output?.output?.output || output?.output || output || {};
}

function endpointEvidence(review = {}, source = {}) {
  const reviewOutput = outputValue(review.output);
  const sourceOutput = outputValue(source.output);
  const candidate = object(
    review.output?.cinema_endpoint_fidelity ||
    reviewOutput.cinema_endpoint_fidelity ||
    source.output?.cinema_endpoint_fidelity ||
    sourceOutput.cinema_endpoint_fidelity,
  );
  return text(candidate.contract) === ENDPOINT_CONTRACT ? candidate : {};
}

function frameReference(task = {}, endpoint = "first") {
  const input = object(task.input);
  const generation = object(input.generation);
  const provider = {
    ...object(generation.provider_parameters),
    ...object(input.provider_parameters),
  };
  return endpoint === "first"
    ? input.first_frame ||
      input.firstFrame ||
      input.start_frame ||
      input.startFrame ||
      generation.first_frame ||
      generation.firstFrame ||
      provider.first_frame ||
      provider.firstFrame ||
      null
    : input.last_frame ||
      input.lastFrame ||
      input.end_frame ||
      input.endFrame ||
      generation.last_frame ||
      generation.lastFrame ||
      provider.last_frame ||
      provider.lastFrame ||
      null;
}

function shotBibleSource(shot = {}) {
  return object(shot.metadata?.shot_bible_source);
}

function actorKey(value) {
  if (typeof value === "string") return text(value).toLowerCase();
  if (!value || typeof value !== "object") return "";
  return text(
    value.identity_profile_id ||
    value.profile_id ||
    value.person_id ||
    value.actor_id ||
    value.id ||
    value.name,
  ).toLowerCase();
}

function shotActorKeys(shot = {}) {
  const source = shotBibleSource(shot);
  const identity = object(source.identity_requirements);
  return unique([
    ...list(shot.actors).map(actorKey),
    actorKey(identity),
    identity.identity_profile_id,
    identity.profile_id,
    identity.person_id,
  ].map((value) => text(value).toLowerCase()));
}

function stateActorKeys(state = {}) {
  const identity = object(state.identity);
  return unique([
    ...list(identity.actors).map(actorKey),
    actorKey(identity.requirements),
  ].map((value) => text(value).toLowerCase()));
}

function sequence(shot = {}) {
  return {
    scene_number: number(shot.scene_number, 0),
    shot_number: number(shot.shot_number, 0),
  };
}

function before(left = {}, right = {}) {
  const a = sequence(left);
  const b = sequence(right);
  return a.scene_number < b.scene_number ||
    (a.scene_number === b.scene_number && a.shot_number < b.shot_number);
}

function stateFromShot(shot = {}) {
  const state = object(shot.metadata?.cinematic_state_memory);
  return text(state.contract) === STATE_CONTRACT ? state : null;
}

function previousPublishedStates(shots = [], current = {}) {
  return list(shots)
    .filter((shot) => before(shot, current))
    .map((shot) => ({ shot, state: stateFromShot(shot) }))
    .filter((entry) => entry.state)
    .sort((left, right) => {
      const a = sequence(left.shot);
      const b = sequence(right.shot);
      return a.scene_number - b.scene_number || a.shot_number - b.shot_number;
    });
}

function reviewApproved(review = {}, source = {}) {
  if (text(review.status).toUpperCase() !== "COMPLETED") return false;
  if (review.review?.approved !== true) return false;
  if (review.metadata?.automated_perceptual_validation_passed !== true) return false;
  if (review.metadata?.generated_media_released_for_downstream !== true) return false;
  if (text(source.status).toUpperCase() !== "COMPLETED") return false;
  if (source.metadata?.approved_for_downstream_after_perceptual_review !== true) {
    return false;
  }
  const endpoint = endpointEvidence(review, source);
  const endpointExpected =
    review.input?.requirements?.expected_contract
      ?.first_last_frame_conditioning_expected === true ||
    source.capability === "ai.video.first_last_frame_to_video";
  if (endpointExpected && endpoint.passed !== true) return false;
  return true;
}

function qualitySnapshot(review = {}, source = {}) {
  const validation = object(
    review.output?.perceptual_validation ||
    review.output?.output?.perceptual_validation ||
    source.output?.perceptual_validation ||
    source.output?.output?.perceptual_validation,
  );
  const evidence = object(validation.evidence);
  const scoreContract = object(validation.score_contract);
  return bounded({
    perceptual_review_contract: REVIEW_CONTRACT,
    passed: validation.passed === true,
    score_contract: scoreContract,
    evidence: {
      overall_score: evidence.overall_score,
      identity_score: evidence.identity_score,
      environment_score: evidence.environment_score,
      camera_score: evidence.camera_score,
      continuity_score: evidence.continuity_score,
      physics_score: evidence.physics_score,
      artifact_score: evidence.artifact_score,
    },
  });
}

function buildStateSnapshot({ shot, source, review } = {}) {
  const sourceData = shotBibleSource(shot);
  const endpoint = endpointEvidence(review, source);
  const continuation = object(
    source.input?.requirements?.shot_continuation ||
    source.input?.provider_parameters?.shot_continuation ||
    source.input?.generation?.provider_parameters?.shot_continuation,
  );
  const base = bounded({
    contract: STATE_CONTRACT,
    version: 1,
    organization_id: shot.organization_id,
    creative_project_id: shot.creative_project_id,
    scene_id: shot.scene_id,
    shot_id: shot.id,
    sequence: sequence(shot),
    identity: {
      actors: list(shot.actors),
      requirements: object(sourceData.identity_requirements),
      wardrobe: list(sourceData.wardrobe),
      hair_makeup: list(sourceData.hair_makeup),
      identity_lock: object(
        source.input?.identity_lock || source.input?.generation?.identity_lock,
      ),
    },
    product: {
      products: list(shot.products),
      requirements: object(sourceData.product_requirements),
    },
    environment: {
      location: object(shot.location),
      production_design: object(shot.production_design),
      props: list(sourceData.props),
    },
    spatial: {
      continuity: object(shot.continuity),
      camera: object(shot.camera),
      lighting: object(shot.lighting),
      frame_plan: object(shot.frame_plan),
    },
    endpoint_lineage: {
      source_generation_task_id: source.id,
      review_task_id: review.id,
      source_asset_node_id: source.output?.asset_node_id || null,
      previous_shot_id:
        continuation.previous_shot_id ||
        source.metadata?.previous_shot_id ||
        null,
      previous_generation_node_id:
        continuation.previous_generation_node_id ||
        source.metadata?.previous_generation_node_id ||
        null,
      previous_perceptual_review_node_id:
        continuation.previous_perceptual_review_node_id ||
        source.metadata?.previous_perceptual_review_node_id ||
        null,
      closing_keyframe_task_id:
        source.metadata?.closing_keyframe_task_id ||
        source.input?.provider_parameters?.closing_keyframe_task_id ||
        null,
      closing_keyframe_review_task_id:
        source.metadata?.closing_keyframe_review_task_id ||
        source.input?.provider_parameters?.closing_keyframe_review_task_id ||
        null,
      first_frame_binding_hash: hash(frameReference(source, "first")),
      last_frame_binding_hash: hash(frameReference(source, "last")),
      endpoint_fidelity_contract: endpoint.contract || null,
      opening_similarity: endpoint.first_frame?.combined_similarity ?? null,
      closing_similarity: endpoint.last_frame?.combined_similarity ?? null,
      source_video_sha256: endpoint.source_video_sha256 || null,
    },
    quality: qualitySnapshot(review, source),
    provenance: {
      reviewed_only: true,
      failed_generation_excluded: true,
      superseded_generation_excluded: true,
      promptless_source_of_truth: true,
      source_generation_task_id: source.id,
      review_task_id: review.id,
      repair_attempt: source.metadata?.repair_attempt || 0,
      repair_of_task_id: source.metadata?.repair_of_task_id || null,
      provider_id: source.provider_id || source.output?.provider || null,
    },
  });
  return {
    ...base,
    state_hash: hash(base),
  };
}

async function publishApprovedState(review = {}) {
  if (!perceptualReview(review)) return null;
  const sourceId = sourceTaskId(review);
  const source = sourceId ? await ProductionTaskRuntime.get(sourceId) : null;
  if (!source || !cinemaTask(source) || !source.shot_id) return null;
  if (!reviewApproved(review, source)) return null;

  const shot = await ShotRepository.get(source.shot_id);
  if (!shot) throw new Error(`CREATIVE_CINEMATIC_STATE_SHOT_NOT_FOUND:${source.shot_id}`);
  if (
    text(shot.organization_id) !== text(source.organization_id) ||
    text(shot.creative_project_id) !== text(source.creative_project_id)
  ) {
    throw new Error("CREATIVE_CINEMATIC_STATE_SHOT_SCOPE_MISMATCH");
  }
  if (
    text(shot.metadata?.cinematic_state_memory_review_task_id) === text(review.id) &&
    stateFromShot(shot)
  ) {
    return stateFromShot(shot);
  }

  const shots = await ShotRepository.list({
    organization_id: source.organization_id,
    creative_project_id: source.creative_project_id,
  });
  const previous = previousPublishedStates(shots, shot);
  const previousSameScene = [...previous]
    .reverse()
    .find((entry) => text(entry.shot.scene_id) === text(shot.scene_id));
  const previousAuthoritative = previousSameScene || previous.at(-1) || null;
  const snapshot = buildStateSnapshot({ shot, source, review });
  const state = {
    ...snapshot,
    previous_authoritative_state_hash:
      previousAuthoritative?.state?.state_hash || null,
    previous_authoritative_chain_hash:
      previousAuthoritative?.state?.chain_hash || null,
    chain_hash: hash({
      previous_chain_hash: previousAuthoritative?.state?.chain_hash || null,
      state_hash: snapshot.state_hash,
    }),
  };

  await ShotRepository.update(shot.id, {
    metadata: {
      ...object(shot.metadata),
      cinematic_state_memory: state,
      cinematic_state_memory_contract: STATE_CONTRACT,
      cinematic_state_memory_state_hash: state.state_hash,
      cinematic_state_memory_chain_hash: state.chain_hash,
      cinematic_state_memory_review_task_id: review.id,
      cinematic_state_memory_source_task_id: source.id,
      cinematic_state_memory_published_at: new Date().toISOString(),
      cinematic_state_memory_reviewed_only: true,
      cinematic_state_memory_promptless: true,
    },
  });
  return state;
}

function intersects(left = [], right = []) {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function compactExecutionState(state = {}) {
  return bounded({
    shot_id: state.shot_id,
    scene_id: state.scene_id,
    sequence: state.sequence,
    state_hash: state.state_hash,
    chain_hash: state.chain_hash,
    identity: state.identity,
    product: state.product,
    environment: state.environment,
    spatial: state.spatial,
    endpoint_lineage: state.endpoint_lineage,
  });
}

async function buildLedger(task = {}) {
  if (!cinemaTask(task) || !task.shot_id) return null;
  const [current, shots] = await Promise.all([
    ShotRepository.get(task.shot_id),
    ShotRepository.list({
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
    }),
  ]);
  if (!current) return null;
  const previous = previousPublishedStates(shots, current);
  const currentActors = shotActorKeys(current);
  const latestSameScene = [...previous]
    .reverse()
    .find((entry) => text(entry.shot.scene_id) === text(current.scene_id));
  const identityMatches = [...previous]
    .reverse()
    .filter((entry) => intersects(currentActors, stateActorKeys(entry.state)));
  const latestProject = previous.at(-1) || null;
  const relevant = [];
  for (const candidate of [latestSameScene, ...identityMatches, latestProject]) {
    if (!candidate) continue;
    if (relevant.some((entry) => text(entry.shot.id) === text(candidate.shot.id))) {
      continue;
    }
    relevant.push(candidate);
    if (relevant.length >= MAX_RELEVANT_STATES) break;
  }

  const priorShots = shots.filter((shot) => before(shot, current));
  const memoryGaps = priorShots
    .filter((shot) => !stateFromShot(shot))
    .slice(-MAX_HASH_HISTORY)
    .map((shot) => shot.id);
  const history = previous
    .slice(-MAX_HASH_HISTORY)
    .map((entry) => ({
      shot_id: entry.state.shot_id,
      scene_id: entry.state.scene_id,
      state_hash: entry.state.state_hash,
      chain_hash: entry.state.chain_hash,
    }));
  const ledgerBase = bounded({
    contract: LEDGER_CONTRACT,
    version: 1,
    current_shot_id: current.id,
    current_scene_id: current.scene_id,
    current_sequence: sequence(current),
    authoritative_states: relevant.map((entry) =>
      compactExecutionState(entry.state),
    ),
    approved_state_hash_history: history,
    unpublished_prior_shot_ids: memoryGaps,
    policy: {
      reviewed_only: true,
      failed_or_superseded_outputs_excluded: true,
      mutable_planning_state_not_authoritative: true,
      latest_same_scene_state_preferred: true,
      shared_identity_history_preferred: true,
      promptless_source_of_truth: true,
      do_not_rewrite_approved_neighbors: true,
    },
  });
  return {
    ...ledgerBase,
    ledger_hash: hash(ledgerBase),
  };
}

async function bindLedger(task = {}) {
  if (!cinemaTask(task) || !task.shot_id) return task;
  if (["RUNNING", "COMPLETED"].includes(text(task.status).toUpperCase())) {
    return task;
  }
  const ledger = await buildLedger(task);
  if (!ledger) return task;
  if (
    text(task.metadata?.cinematic_state_memory_ledger_hash) ===
      text(ledger.ledger_hash)
  ) {
    return task;
  }
  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      cinematic_state_memory: ledger,
      requirements: {
        ...object(task.input?.requirements),
        cinematic_state_memory: ledger,
      },
    },
    metadata: {
      ...object(task.metadata),
      cinematic_state_memory_ledger_contract: LEDGER_CONTRACT,
      cinematic_state_memory_ledger_hash: ledger.ledger_hash,
      cinematic_state_memory_authoritative_state_count:
        list(ledger.authoritative_states).length,
      cinematic_state_memory_history_count:
        list(ledger.approved_state_hash_history).length,
      cinematic_state_memory_gap_count:
        list(ledger.unpublished_prior_shot_ids).length,
      cinematic_state_memory_reviewed_only: true,
    },
  });
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutStateMemory = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithCinematicStateMemory(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const isReview = perceptualReview(task);
    if (cinemaTask(task)) task = await bindLedger(task);
    const result = await dispatchWithoutStateMemory(task.id);
    if (!isReview) return result;
    const after = await ProductionTaskRuntime.get(task.id) || result;
    if (after) await publishApprovedState(after);
    return ProductionTaskRuntime.get(task.id) || after;
  };
}

install();

export const CreativeCinematicStateMemoryBootstrap = Object.freeze({
  installed: true,
  stateContract: STATE_CONTRACT,
  ledgerContract: LEDGER_CONTRACT,
  buildStateSnapshot,
  publishApprovedState,
  buildLedger,
  bindLedger,
});
