import {
  buildProductionGraph,
} from "../planner/ProductionGraphPlanner";

import {
  buildUniversalProductionGraph,
} from "../planner/UniversalProductionGraphPlanner";

import {
  bindCreativeAssetManifest,
} from "../planner/bindCreativeAssetManifest";

import {
  buildCreativePerformanceContracts,
} from "@/lib/creative/performance/runtime/CreativePerformanceContractRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  CreativeIdentityKeyframeGraphRuntime,
} from "@/lib/creative/identity/runtime/CreativeIdentityKeyframeGraphRuntime";

import {
  createProductionGraph,
} from "../documents/ProductionGraph";

import * as Repository
from "../repositories/ProductionGraphRepository";

function workflowKind(input = {}) {
  return String(input.creative_plan?.workflow_kind || "")
    .trim()
    .toUpperCase();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function humanShot(shot = {}) {
  const source = JSON.stringify({
    actors: shot.actors,
    subject: shot.subject,
    action: shot.action,
    performance: shot.performance,
    purpose: shot.purpose,
  }).toLowerCase();
  return list(shot.actors).length > 0 || /\b(person|people|artist|performer|singer|actor|actress|model|dancer|staff|employee|founder|owner|woman|man|face|portrait)\b/.test(source);
}

function namedHumanShot(shot = {}) {
  return humanShot(shot) && list(shot.actors).some((actor) =>
    text(actor?.name || actor?.label || actor).length > 1,
  );
}

function singingShot(shot = {}) {
  const source = JSON.stringify({
    action: shot.action,
    performance: shot.performance,
    purpose: shot.purpose,
    performance_contract: shot.performance_contract,
  }).toLowerCase();
  return /\b(sing|sings|singing|lip[- ]?sync|vocal performance|performs? the song|verse|chorus|lyric)\b/.test(source);
}

function videoShot(shot = {}) {
  const service = text(
    shot.generation?.capability ||
    shot.generation?.service ||
    shot.capability ||
    shot.service_id,
  ).toLowerCase();
  return service.includes("video");
}

function validateUniversalCreativeContract({ creative_plan = {}, shots = [] } = {}) {
  const plan = object(creative_plan);
  const universal = list(plan.concept_candidates).length >= 3 &&
    Boolean(text(plan.selected_concept_id)) &&
    Boolean(object(plan.music_world));
  if (workflowKind({ creative_plan: plan }) === "TEMPORAL" && !universal) {
    throw new Error("UNIVERSAL_CREATIVE_DOSSIER_REQUIRED_BEFORE_PRODUCTION");
  }

  const namedHumanShots = list(shots).filter(namedHumanShot);
  const missingIdentity = namedHumanShots.filter((shot) => {
    const contract = object(shot.performance_contract || shot.metadata?.performance_contract);
    const requirements = object(shot.identity_requirements);
    return !list(
      contract.identity_reference_asset_ids ||
      requirements.reference_asset_ids ||
      shot.reference_asset_ids,
    ).length;
  });
  if (missingIdentity.length) {
    throw new Error(`UNIVERSAL_IDENTITY_REFERENCES_REQUIRED:${missingIdentity.map((shot) => shot.id).join(",")}`);
  }

  const humanVideoShots = namedHumanShots.filter(videoShot);
  const missingAtlas = humanVideoShots.filter((shot) =>
    !text(
      shot.identity_requirements?.identity_atlas_asset_node_id ||
      shot.generation?.identity_lock?.identity_atlas_asset_node_id ||
      shot.metadata?.identity_atlas_asset_node_id,
    ),
  );
  if (missingAtlas.length) {
    throw new Error(`IDENTITY_ATLAS_REQUIRED:${missingAtlas.map((shot) => shot.id).join(",")}`);
  }
  const missingKeyframe = humanVideoShots.filter((shot) =>
    shot.keyframe_contract?.required !== true ||
    !text(shot.keyframe_contract?.identity_atlas_hash),
  );
  if (missingKeyframe.length) {
    throw new Error(`IDENTITY_STORY_KEYFRAME_REQUIRED:${missingKeyframe.map((shot) => shot.id).join(",")}`);
  }

  const singing = list(shots).filter(singingShot);
  const invalidSinging = singing.filter((shot) => {
    const contract = object(shot.performance_contract || shot.metadata?.performance_contract);
    return contract.singing_visible !== true ||
      contract.mouth_visible !== true ||
      contract.lip_sync_required !== true ||
      !text(contract.primary_audio_asset_id) ||
      !Number.isFinite(Number(contract.audio_start_seconds)) ||
      !Number.isFinite(Number(contract.audio_end_seconds));
  });
  if (invalidSinging.length) {
    throw new Error(`MUSIC_PERFORMANCE_CONTRACT_INVALID:${invalidSinging.map((shot) => shot.id).join(",")}`);
  }

  if (plan.production?.dry_run_dossier_required_before_paid_generation !== true) {
    throw new Error("ZERO_COST_CREATIVE_DOSSIER_GATE_REQUIRED");
  }
  if (plan.production?.reuse_policy !== "NO_REUSE_UNLESS_EXPLICITLY_APPROVED") {
    throw new Error("UNAPPROVED_ASSET_REUSE_POLICY_BLOCKED");
  }
  if (humanVideoShots.length && plan.production?.identity_story_keyframe_required_before_video !== true) {
    throw new Error("IDENTITY_KEYFRAME_PRODUCTION_GATE_REQUIRED");
  }
  if (humanVideoShots.length && plan.production?.identity_story_keyframe_human_approval_required_before_video !== true) {
    throw new Error("IDENTITY_KEYFRAME_HUMAN_APPROVAL_GATE_REQUIRED");
  }
}

export const ProductionGraphRuntime = {
  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async get(id) {
    return Repository.getById(id);
  },

  async create(input = {}) {
    return Repository.create(
      createProductionGraph(input),
    );
  },

  async update(id, values = {}) {
    return Repository.update(
      id,
      values,
    );
  },

  async plan(input = {}) {
    const kind = workflowKind(input);

    if (kind && kind !== "TEMPORAL") {
      return buildUniversalProductionGraph(input);
    }

    const assets = await CreativeAssetsRuntime.list({
      organization_id: input.organization_id,
      creative_project_id: input.creative_project_id,
    });

    const bound = bindCreativeAssetManifest({
      scenes: input.scenes,
      shots: input.shots,
      creative_plan: input.creative_plan,
    });

    const performanceBound = buildCreativePerformanceContracts({
      ...bound,
      assets,
    });

    validateUniversalCreativeContract({
      creative_plan: input.creative_plan,
      shots: performanceBound.shots,
    });

    const graph = buildProductionGraph({
      ...input,
      ...performanceBound,
    });

    return CreativeIdentityKeyframeGraphRuntime.apply({
      graph,
      shots: performanceBound.shots,
    });
  },
};
