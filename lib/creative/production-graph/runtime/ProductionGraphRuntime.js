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

    return buildProductionGraph({
      ...input,
      ...performanceBound,
    });
  },
};
