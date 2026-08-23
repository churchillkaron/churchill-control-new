import crypto from "node:crypto";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as ShotRepository
from "@/lib/creative/shots/repositories/ShotRepository";
import {
  CreativeCinematicContinuityConflictGate,
} from "./CreativeCinematicContinuityConflictGate";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.cinematic-continuity-auto-repair-bootstrap.v1",
);
const REPAIR_CONTRACT = "CREATIVE_CINEMATIC_CONTINUITY_AUTO_REPAIR_V1";
const GATE_CONTRACT = "CREATIVE_CINEMATIC_CONTINUITY_CONFLICT_GATE_V1";
const RESOLUTION_CONTRACT = "CREATIVE_CINEMATIC_CONTINUITY_RESOLUTION_V1";
const LEDGER_CONTRACT = "CREATIVE_CINEMATIC_STATE_LEDGER_V1";
const CONFLICT_PREFIX = "CREATIVE_CINEMATIC_CONTINUITY_CONFLICT:";

const REPAIRABLE_CATEGORIES = new Set([
  "identity",
  "wardrobe",
  "hair_makeup",
  "products",
  "props",
  "location",
  "lighting",
  "spatial_orientation",
]);

const ORIENTATION_KEYWORDS = [
  "screen_direction",
  "screen_directionality",
  "axis",
  "camera_side",
  "eyeline",
  "orientation",
  "blocking",
  "position",
  "left_right",
  "right_left",
  "travel_direction",
  "movement_direction",
  "facing_direction",
  "entrance_side",
  "exit_side",
];

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

function normalizedKey(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .replace(/\s+/g, "_")
    .toLowerCase();
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

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function unique(values = []) {
  return [...new Set(list(values).map(text).filter(Boolean))];
}

function pathIsOrientation(path = []) {
  const candidate = normalizedKey(path.join("_"));
  return ORIENTATION_KEYWORDS.some((keyword) => candidate.includes(keyword));
}

function stripOrientation(value, path = []) {
  if (path.length && pathIsOrientation(path)) return undefined;
  if (Array.isArray(value) || !value || typeof value !== "object") {
    return clone(value);
  }
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    const stripped = stripOrientation(child, [...path, key]);
    if (stripped !== undefined) result[key] = stripped;
  }
  return result;
}

function pickOrientation(value, path = []) {
  if (path.length && pathIsOrientation(path)) return clone(value);
  if (Array.isArray(value) || !value || typeof value !== "object") {
    return undefined;
  }
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    const selected = pickOrientation(child, [...path, key]);
    if (selected !== undefined) result[key] = selected;
  }
  return Object.keys(result).length ? result : undefined;
}

function mergeDeep(base, overlay) {
  if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) {
    return overlay === undefined ? clone(base) : clone(overlay);
  }
  const result = {
    ...object(clone(base)),
  };
  for (const [key, value] of Object.entries(overlay)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeDeep(result[key], value);
    } else {
      result[key] = clone(value);
    }
  }
  return result;
}

function replaceOrientation(current = {}, approved = {}) {
  const preserved = stripOrientation(object(current)) || {};
  const authoritative = pickOrientation(object(approved)) || {};
  return mergeDeep(preserved, authoritative);
}

function stateForConflict(ledger = {}, conflict = {}) {
  const states = list(ledger.authoritative_states);
  return states.find((state) =>
    text(state.state_hash) === text(conflict.source_state_hash),
  ) || states.find((state) =>
    text(state.shot_id) === text(conflict.source_shot_id),
  ) || null;
}

function repairShotFromApprovedState(shot = {}, ledger = {}, conflicts = []) {
  const repaired = clone(shot);
  repaired.metadata = object(repaired.metadata);
  repaired.metadata.shot_bible_source = {
    ...object(repaired.metadata.shot_bible_source),
  };
  const sourceHashes = [];
  const sourceChainHashes = [];

  for (const conflict of list(conflicts)) {
    const category = text(conflict.category);
    if (!REPAIRABLE_CATEGORIES.has(category)) return null;
    const state = stateForConflict(ledger, conflict);
    if (!state) return null;
    sourceHashes.push(state.state_hash);
    sourceChainHashes.push(state.chain_hash);

    switch (category) {
      case "identity":
        repaired.metadata.shot_bible_source.identity_requirements =
          clone(object(state.identity?.requirements));
        break;
      case "wardrobe":
        repaired.metadata.shot_bible_source.wardrobe =
          clone(list(state.identity?.wardrobe));
        break;
      case "hair_makeup":
        repaired.metadata.shot_bible_source.hair_makeup =
          clone(list(state.identity?.hair_makeup));
        break;
      case "products":
        repaired.products = clone(list(state.product?.products));
        break;
      case "props":
        repaired.metadata.shot_bible_source.props =
          clone(list(state.environment?.props));
        break;
      case "location":
        repaired.location = clone(object(state.environment?.location));
        break;
      case "lighting":
        repaired.lighting = clone(object(state.spatial?.lighting));
        break;
      case "spatial_orientation":
        repaired.continuity = replaceOrientation(
          object(repaired.continuity),
          object(state.spatial?.continuity),
        );
        repaired.camera = replaceOrientation(
          object(repaired.camera),
          object(state.spatial?.camera),
        );
        break;
      default:
        return null;
    }
  }

  return {
    shot: repaired,
    source_state_hashes: unique(sourceHashes),
    source_chain_hashes: unique(sourceChainHashes),
  };
}

function eligibleFailure(error, output = {}) {
  if (!text(error?.message || error).startsWith(CONFLICT_PREFIX)) return false;
  const evaluation = object(output.cinematic_continuity_gate);
  if (text(evaluation.contract) !== GATE_CONTRACT) return false;
  if (evaluation.passed === true || !list(evaluation.conflicts).length) return false;
  return true;
}

function autoRepairAllowed(task = {}) {
  return !(
    task.input?.requirements?.cinematic_continuity_auto_repair_allowed === false ||
    task.metadata?.cinematic_continuity_auto_repair_allowed === false
  );
}

async function attemptRepair(id, error, output = {}) {
  if (!eligibleFailure(error, output)) return null;
  const task = await ProductionTaskRuntime.get(id);
  if (!task || !task.shot_id || !autoRepairAllowed(task)) return null;
  const shot = await ShotRepository.get(task.shot_id);
  if (!shot) return null;
  if (
    text(shot.organization_id) !== text(task.organization_id) ||
    text(shot.creative_project_id) !== text(task.creative_project_id)
  ) {
    return null;
  }

  const ledger = object(
    task.input?.cinematic_state_memory ||
    task.input?.requirements?.cinematic_state_memory,
  );
  if (text(ledger.contract) !== LEDGER_CONTRACT) return null;

  const originalEvaluation = object(output.cinematic_continuity_gate);
  const conflicts = list(originalEvaluation.conflicts);
  const repaired = repairShotFromApprovedState(shot, ledger, conflicts);
  if (!repaired) return null;

  const repairedEvaluation =
    CreativeCinematicContinuityConflictGate.evaluateContinuity({
      shot: repaired.shot,
      task,
      ledger,
    });
  if (repairedEvaluation.passed !== true) return null;

  const repairBase = {
    contract: REPAIR_CONTRACT,
    version: 1,
    applied: true,
    passed: true,
    pre_gpu: true,
    provider_calls_added: 0,
    gpu_spend_added: 0,
    current_shot_id: task.shot_id,
    original_analysis_hash: originalEvaluation.analysis_hash || null,
    repaired_analysis_hash: repairedEvaluation.analysis_hash || null,
    original_conflict_categories: unique(
      conflicts.map((conflict) => conflict.category),
    ),
    remaining_conflict_categories:
      repairedEvaluation.conflict_categories || [],
    source_state_hashes: repaired.source_state_hashes,
    source_chain_hashes: repaired.source_chain_hashes,
    original_resolution_hash: hash(originalEvaluation.resolved_state),
    repaired_resolution_hash: hash(repairedEvaluation.resolved_state),
    canonical_shot_hash: hash(shot),
    synthetic_repaired_shot_hash: hash(repaired.shot),
    execution_contract_only: true,
    canonical_shot_mutated: false,
    canonical_story_mutated: false,
    intentional_story_changes_preserved: true,
    revalidated_with_same_conflict_gate: true,
    policy: {
      restore_only_reviewed_authoritative_state: true,
      do_not_invent_visual_state: true,
      do_not_mutate_shot_bible: true,
      do_not_mutate_storyboard: true,
      preserve_non_conflicting_direction: true,
      fail_closed_when_deterministic_repair_cannot_pass: true,
    },
  };
  const repair = {
    ...repairBase,
    repair_hash: hash(repairBase),
  };

  const updated = await ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      cinematic_continuity_resolution: repairedEvaluation.resolved_state,
      requirements: {
        ...object(task.input?.requirements),
        cinematic_continuity_resolution: repairedEvaluation.resolved_state,
        cinematic_continuity_gate: {
          contract: GATE_CONTRACT,
          analysis_hash: repairedEvaluation.analysis_hash,
          passed: true,
          conflict_categories: [],
          inherited_categories: repairedEvaluation.inherited_categories || [],
          intentional_change_categories:
            repairedEvaluation.intentional_change_categories || [],
          auto_repair_contract: REPAIR_CONTRACT,
          auto_repair_applied: true,
          auto_repair_passed: true,
        },
        cinematic_continuity_auto_repair: {
          contract: REPAIR_CONTRACT,
          repair_hash: repair.repair_hash,
          applied: true,
          passed: true,
          pre_gpu: true,
          provider_calls_added: 0,
          gpu_spend_added: 0,
          source_state_hashes: repaired.source_state_hashes,
        },
      },
    },
    metadata: {
      ...object(task.metadata),
      cinematic_continuity_conflict_gate_contract: GATE_CONTRACT,
      cinematic_continuity_resolution_contract: RESOLUTION_CONTRACT,
      cinematic_continuity_gate_analysis_hash:
        repairedEvaluation.analysis_hash,
      cinematic_continuity_gate_passed: true,
      cinematic_continuity_conflict_count: 0,
      cinematic_continuity_conflict_categories: [],
      cinematic_continuity_auto_repair_contract: REPAIR_CONTRACT,
      cinematic_continuity_auto_repair_hash: repair.repair_hash,
      cinematic_continuity_auto_repair_applied: true,
      cinematic_continuity_auto_repair_passed: true,
      cinematic_continuity_auto_repair_provider_calls_added: 0,
      cinematic_continuity_auto_repair_gpu_spend_added: 0,
      cinematic_continuity_auto_repair_canonical_shot_mutated: false,
      cinematic_continuity_auto_repair_canonical_story_mutated: false,
      cinematic_continuity_checked_before_provider_submission: true,
    },
    output: {
      ...object(task.output),
      cinematic_continuity_gate: repairedEvaluation,
      cinematic_continuity_auto_repair: repair,
      provider_submission_unblocked_after_continuity_repair: true,
      gpu_spend_unblocked_after_continuity_repair: true,
    },
    error: null,
  });

  return updated;
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const failWithoutAutoRepair = ProductionTaskRuntime.fail.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.fail = async function failWithCinematicContinuityAutoRepair(
    id,
    error,
    output = {},
  ) {
    const repaired = await attemptRepair(id, error, output);
    if (repaired) return repaired;
    return failWithoutAutoRepair(id, error, output);
  };
}

install();

export const CreativeCinematicContinuityAutoRepairBootstrap = Object.freeze({
  installed: true,
  repairContract: REPAIR_CONTRACT,
  gateContract: GATE_CONTRACT,
  resolutionContract: RESOLUTION_CONTRACT,
  repairShotFromApprovedState,
  eligibleFailure,
  attemptRepair,
});
