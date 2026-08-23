import crypto from "node:crypto";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeAutonomousRepairDirectorRuntime,
} from "./CreativeAutonomousRepairDirectorRuntime";

const DIRECTOR_FLAG = Symbol.for(
  "avantiqo.creative.cinema-repair-continuity-director.v1",
);
const DISPATCH_FLAG = Symbol.for(
  "avantiqo.creative.cinema-repair-continuity-dispatch.v1",
);
const CONTRACT = "CREATIVE_CINEMA_REPAIR_CONTINUITY_MEMORY_V1";
const ENDPOINT_CONTRACT = "CREATIVE_CINEMA_ENDPOINT_FIDELITY_V1";
const PERCEPTUAL_REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const REPLACEMENT_REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";

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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value ?? null)))
    .digest("hex");
}

function unique(values = []) {
  return [...new Set(list(values).map(text).filter(Boolean))];
}

function outputValue(output = {}) {
  return output?.output?.output || output?.output || output || {};
}

function endpointEvidence(task = {}) {
  const value = outputValue(task.output);
  const evidence = object(
    task.output?.cinema_endpoint_fidelity ||
    value.cinema_endpoint_fidelity,
  );
  return text(evidence.contract) === ENDPOINT_CONTRACT ? evidence : null;
}

function perceptualReview(task = {}) {
  const contract = text(task.metadata?.contract);
  return contract === PERCEPTUAL_REVIEW_CONTRACT ||
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

function endpointFailureCodes(evidence = {}) {
  const failures = [];
  if (evidence.first_frame?.passed !== true) {
    failures.push("cinema_opening_endpoint_fidelity");
  }
  if (evidence.last_frame?.passed !== true) {
    failures.push("cinema_closing_endpoint_fidelity");
  }
  for (const failure of list(evidence.explicit_temporal_evidence?.failures)) {
    failures.push(`cinema_${text(failure)}`);
  }
  if (!failures.length && evidence.passed !== true) {
    failures.push("cinema_endpoint_fidelity");
  }
  return unique(failures);
}

function endpointRepairInstructions(failures = []) {
  const instructions = [];
  for (const failure of failures) {
    if (failure === "cinema_opening_endpoint_fidelity") {
      instructions.push(
        "Correct only opening-frame drift; preserve the approved first-frame binding and neighboring-shot handoff exactly.",
      );
    } else if (failure === "cinema_closing_endpoint_fidelity") {
      instructions.push(
        "Correct only closing-frame drift; preserve the approved closing-keyframe binding and next-shot handoff exactly.",
      );
    } else if (failure.includes("identity_preserved")) {
      instructions.push(
        "Correct identity drift only; preserve the approved identity lock, keyframe lineage, framing, timing and unaffected motion.",
      );
    } else if (failure.includes("requested_camera_correct")) {
      instructions.push(
        "Correct the camera-path defect only; preserve endpoint images, identity, timing and approved neighboring shots.",
      );
    } else if (failure.includes("physics_valid")) {
      instructions.push(
        "Correct motion physics only; preserve endpoint images, identity, camera intent and approved neighboring shots.",
      );
    } else if (failure.includes("continuity_valid")) {
      instructions.push(
        "Correct temporal continuity only; preserve both governed endpoint images and every unaffected shot requirement.",
      );
    }
  }
  return unique(
    instructions.length
      ? instructions
      : [
          "Repair only the failed Cinema endpoint or temporal requirement; preserve both governed endpoints, identity lineage and all approved neighboring shots.",
        ],
  );
}

function endpointPerceptualValidation(evidence = {}) {
  const failures = endpointFailureCodes(evidence);
  const repairInstructions = endpointRepairInstructions(failures);
  return {
    contract: "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_V1",
    passed: false,
    checks: {
      cinema_endpoint_fidelity: false,
      cinema_opening_endpoint_fidelity:
        evidence.first_frame?.passed === true,
      cinema_closing_endpoint_fidelity:
        evidence.last_frame?.passed === true,
      cinema_explicit_temporal_evidence:
        evidence.explicit_temporal_evidence?.passed === true,
    },
    evidence: {
      failures,
      repair_instructions: repairInstructions,
      cinema_endpoint_fidelity: evidence,
    },
    validation_failures: failures,
    repair_instructions: repairInstructions,
    endpoint_fidelity_contract: ENDPOINT_CONTRACT,
  };
}

async function normalizeEndpointFailures({ organization_id, creative_project_id } = {}) {
  if (!organization_id || !creative_project_id) return [];
  const tasks = await ProductionTaskRuntime.list({
    organization_id,
    creative_project_id,
  });
  const taskMap = new Map(tasks.map((task) => [text(task.id), task]));
  const normalized = [];

  for (const review of tasks) {
    if (text(review.status).toUpperCase() !== "FAILED") continue;
    if (!perceptualReview(review)) continue;
    const evidence = endpointEvidence(review);
    if (!evidence || evidence.passed === true) continue;

    const sourceId = sourceTaskId(review);
    const source = sourceId ? taskMap.get(sourceId) : null;
    if (!source || text(source.status).toUpperCase() !== "FAILED") continue;
    if (
      source.metadata?.perceptual_validation_failed === true &&
      review.metadata?.cinema_endpoint_failure_normalized_for_pair_recovery === true
    ) {
      continue;
    }

    const perceptualValidation = endpointPerceptualValidation(evidence);
    await ProductionTaskRuntime.update(source.id, {
      metadata: {
        ...object(source.metadata),
        perceptual_validation_failed: true,
        rejected_before_editing: true,
        automated_perceptual_validation_passed: false,
        approved_for_downstream_after_perceptual_review: false,
        cinema_endpoint_failure_normalized_for_pair_recovery: true,
      },
      output: {
        ...object(source.output),
        cinema_endpoint_fidelity: evidence,
        perceptual_validation: perceptualValidation,
      },
    });
    await ProductionTaskRuntime.update(review.id, {
      metadata: {
        ...object(review.metadata),
        automated_perceptual_validation_passed: false,
        generated_media_released_for_downstream: false,
        cinema_endpoint_failure_normalized_for_pair_recovery: true,
      },
      output: {
        ...object(review.output),
        cinema_endpoint_fidelity: evidence,
        perceptual_validation: perceptualValidation,
      },
    });
    normalized.push({
      source_task_id: source.id,
      review_task_id: review.id,
      failures: perceptualValidation.validation_failures,
    });
  }
  return normalized;
}

function capability(task = {}) {
  return text(task.capability || task.service_code || task.service_id)
    .toLowerCase();
}

function cinemaTask(task = {}) {
  return capability(task).startsWith("ai.video.");
}

function firstFrame(task = {}) {
  return task.input?.first_frame ||
    task.input?.firstFrame ||
    task.input?.provider_parameters?.first_frame ||
    task.input?.provider_parameters?.firstFrame ||
    task.input?.generation?.provider_parameters?.first_frame ||
    task.input?.generation?.provider_parameters?.firstFrame ||
    null;
}

function lastFrame(task = {}) {
  return task.input?.last_frame ||
    task.input?.lastFrame ||
    task.input?.provider_parameters?.last_frame ||
    task.input?.provider_parameters?.lastFrame ||
    task.input?.generation?.provider_parameters?.last_frame ||
    task.input?.generation?.provider_parameters?.lastFrame ||
    null;
}

function identityBinding(task = {}) {
  return task.input?.identity_lock ||
    task.input?.generation?.identity_lock ||
    {};
}

function continuityBinding(task = {}) {
  return task.input?.requirements?.shot_continuation ||
    task.input?.provider_parameters?.shot_continuation ||
    task.input?.generation?.provider_parameters?.shot_continuation ||
    {};
}

function superseded(task = {}) {
  return Boolean(
    text(task.metadata?.superseded_by_repair_task_id) ||
    text(task.metadata?.superseded_by_repair_review_task_id),
  );
}

function approvedNeighborTasks(tasks = [], source = {}) {
  return list(tasks).filter((candidate) =>
    text(candidate.production_graph_id) === text(source.production_graph_id) &&
    text(candidate.scene_id) === text(source.scene_id) &&
    text(candidate.shot_id) &&
    text(candidate.shot_id) !== text(source.shot_id) &&
    text(candidate.status).toUpperCase() === "COMPLETED" &&
    candidate.metadata?.approved_for_downstream_after_perceptual_review === true &&
    !superseded(candidate),
  );
}

function repairBindingSnapshot(task = {}, neighbors = []) {
  const neighborIdentity = neighbors
    .map((candidate) => ({
      shot_id: text(candidate.shot_id),
      execution_node_id: text(candidate.metadata?.execution_node_id),
    }))
    .sort((left, right) =>
      `${left.shot_id}:${left.execution_node_id}`.localeCompare(
        `${right.shot_id}:${right.execution_node_id}`,
      ),
    );
  return {
    shot_id: text(task.shot_id),
    scene_id: text(task.scene_id),
    dependency_set_hash: hash(unique(task.depends_on).sort()),
    first_frame_binding_hash: hash(firstFrame(task)),
    last_frame_binding_hash: hash(lastFrame(task)),
    identity_binding_hash: hash(identityBinding(task)),
    continuity_binding_hash: hash(continuityBinding(task)),
    source_asset_binding_hash: hash(list(task.input?.source_assets)),
    protected_neighbor_count: neighborIdentity.length,
    protected_neighbor_set_hash: hash(neighborIdentity),
  };
}

async function bindRepairContinuityMemory(pair = {}, input = {}) {
  const sourceId = text(pair.source_task_id);
  const replacementId = text(pair.replacement_source_task_id);
  if (!sourceId || !replacementId) return null;

  const [source, replacement, tasks] = await Promise.all([
    ProductionTaskRuntime.get(sourceId),
    ProductionTaskRuntime.get(replacementId),
    ProductionTaskRuntime.list({
      organization_id: input.organization_id,
      creative_project_id: input.creative_project_id,
    }),
  ]);
  if (!source || !replacement || !cinemaTask(source)) return null;

  const neighbors = approvedNeighborTasks(tasks, source);
  const snapshot = repairBindingSnapshot(source, neighbors);
  const specification = object(replacement.input?.repair_specification);

  return ProductionTaskRuntime.update(replacement.id, {
    input: {
      ...object(replacement.input),
      repair_specification: {
        ...specification,
        preserve_approved_direction: true,
        preserve_identity_truth: true,
        preserve_continuity: true,
        preserve_timing: true,
        preserve_governed_first_frame: Boolean(firstFrame(source)),
        preserve_governed_last_frame: Boolean(lastFrame(source)),
        preserve_approved_neighboring_shots: true,
        change_only_failed_requirements: true,
        multi_shot_continuity_guard: {
          contract: CONTRACT,
          protected_neighbor_count: snapshot.protected_neighbor_count,
          protected_neighbor_set_hash: snapshot.protected_neighbor_set_hash,
          dependency_set_hash: snapshot.dependency_set_hash,
          first_frame_binding_hash: snapshot.first_frame_binding_hash,
          last_frame_binding_hash: snapshot.last_frame_binding_hash,
          identity_binding_hash: snapshot.identity_binding_hash,
          continuity_binding_hash: snapshot.continuity_binding_hash,
          source_asset_binding_hash: snapshot.source_asset_binding_hash,
        },
      },
    },
    metadata: {
      ...object(replacement.metadata),
      cinema_repair_continuity_memory_contract: CONTRACT,
      cinema_repair_shot_isolated: true,
      cinema_repair_neighbor_mutation_forbidden: true,
      cinema_repair_full_rereview_required: true,
      cinema_repair_dependency_set_hash: snapshot.dependency_set_hash,
      cinema_repair_first_frame_binding_hash: snapshot.first_frame_binding_hash,
      cinema_repair_last_frame_binding_hash: snapshot.last_frame_binding_hash,
      cinema_repair_identity_binding_hash: snapshot.identity_binding_hash,
      cinema_repair_continuity_binding_hash: snapshot.continuity_binding_hash,
      cinema_repair_source_asset_binding_hash: snapshot.source_asset_binding_hash,
      cinema_repair_protected_neighbor_count: snapshot.protected_neighbor_count,
      cinema_repair_protected_neighbor_set_hash: snapshot.protected_neighbor_set_hash,
    },
  });
}

function sameBinding(left, right) {
  return hash(left) === hash(right);
}

async function assertCinemaRepairContinuity(task = {}) {
  if (
    task.metadata?.generated_media_perceptual_pair_repair !== true ||
    !cinemaTask(task)
  ) {
    return task;
  }

  const originalId = text(task.metadata?.repair_of_task_id);
  if (!originalId) {
    throw new Error("CREATIVE_CINEMA_REPAIR_ORIGINAL_TASK_REQUIRED");
  }
  const original = await ProductionTaskRuntime.get(originalId);
  if (!original) {
    throw new Error("CREATIVE_CINEMA_REPAIR_ORIGINAL_TASK_NOT_FOUND");
  }
  if (text(original.shot_id) !== text(task.shot_id)) {
    throw new Error("CREATIVE_CINEMA_REPAIR_CROSS_SHOT_MUTATION_FORBIDDEN");
  }
  if (!sameBinding(unique(original.depends_on).sort(), unique(task.depends_on).sort())) {
    throw new Error("CREATIVE_CINEMA_REPAIR_DEPENDENCY_DRIFT_FORBIDDEN");
  }
  if (!sameBinding(firstFrame(original), firstFrame(task))) {
    throw new Error("CREATIVE_CINEMA_REPAIR_FIRST_FRAME_DRIFT_FORBIDDEN");
  }
  if (!sameBinding(lastFrame(original), lastFrame(task))) {
    throw new Error("CREATIVE_CINEMA_REPAIR_LAST_FRAME_DRIFT_FORBIDDEN");
  }
  if (!sameBinding(identityBinding(original), identityBinding(task))) {
    throw new Error("CREATIVE_CINEMA_REPAIR_IDENTITY_BINDING_DRIFT_FORBIDDEN");
  }
  if (!sameBinding(continuityBinding(original), continuityBinding(task))) {
    throw new Error("CREATIVE_CINEMA_REPAIR_CONTINUITY_BINDING_DRIFT_FORBIDDEN");
  }
  if (!sameBinding(list(original.input?.source_assets), list(task.input?.source_assets))) {
    throw new Error("CREATIVE_CINEMA_REPAIR_SOURCE_ASSET_DRIFT_FORBIDDEN");
  }
  if (text(task.metadata?.cinema_repair_continuity_memory_contract) !== CONTRACT) {
    throw new Error("CREATIVE_CINEMA_REPAIR_CONTINUITY_MEMORY_REQUIRED");
  }
  const specification = object(task.input?.repair_specification);
  if (
    specification.change_only_failed_requirements !== true ||
    specification.preserve_continuity !== true ||
    specification.preserve_identity_truth !== true ||
    specification.preserve_approved_neighboring_shots !== true
  ) {
    throw new Error("CREATIVE_CINEMA_REPAIR_PRESERVATION_CONTRACT_INVALID");
  }

  return ProductionTaskRuntime.update(task.id, {
    metadata: {
      ...object(task.metadata),
      cinema_repair_continuity_guard_verified: true,
      cinema_repair_continuity_guard_verified_at: new Date().toISOString(),
    },
  });
}

function pairRepairItems(result = {}) {
  const items = [
    ...list(result.pair_recovery?.created),
    ...list(result.created).filter((item) =>
      text(item.repair_kind) === "GENERATED_MEDIA_PERCEPTUAL_PAIR" ||
      Boolean(item.replacement_source_task_id),
    ),
  ];
  const seen = new Set();
  return items.filter((item) => {
    const key = text(item.replacement_source_task_id);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function installDirector() {
  if (CreativeAutonomousRepairDirectorRuntime[DIRECTOR_FLAG]) return;
  const ensureWithoutCinemaMemory =
    CreativeAutonomousRepairDirectorRuntime.ensure.bind(
      CreativeAutonomousRepairDirectorRuntime,
    );
  Object.defineProperty(CreativeAutonomousRepairDirectorRuntime, DIRECTOR_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeAutonomousRepairDirectorRuntime.ensure = async function ensureCinemaRepairMemory(
    input = {},
  ) {
    const normalizedEndpointFailures = await normalizeEndpointFailures(input);
    const result = await ensureWithoutCinemaMemory(input);
    const continuityBindings = [];
    for (const pair of pairRepairItems(result)) {
      const bound = await bindRepairContinuityMemory(pair, input);
      if (bound) continuityBindings.push(bound.id);
    }
    return {
      ...result,
      cinema_endpoint_failures_normalized: normalizedEndpointFailures,
      cinema_repair_continuity_bindings: continuityBindings,
      cinema_repair_continuity_contract: CONTRACT,
    };
  };
}

function installDispatchGuard() {
  if (ProductionTaskRuntime[DISPATCH_FLAG]) return;
  const dispatchWithoutCinemaRepairContinuity =
    ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, DISPATCH_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithCinemaRepairContinuity(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    if (
      task.metadata?.generated_media_perceptual_pair_repair === true &&
      cinemaTask(task)
    ) {
      task = await assertCinemaRepairContinuity(task);
    }
    return dispatchWithoutCinemaRepairContinuity(task.id);
  };
}

installDirector();
installDispatchGuard();

export const CreativeCinemaRepairContinuityBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  normalizeEndpointFailures,
  bindRepairContinuityMemory,
  assertCinemaRepairContinuity,
});
