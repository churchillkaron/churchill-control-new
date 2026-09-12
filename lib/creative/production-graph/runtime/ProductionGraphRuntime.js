import crypto from "node:crypto";

import "@/lib/creative/assets/isolation/runtime/CreativeShotAssetIsolationExecutionGate";
import "@/lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate";
import "@/lib/creative/identity/runtime/CreativeIdentityKeyframeExecutionGate";
import "@/lib/creative/performance/runtime/CreativeLipSyncExecutionGate";
import "@/lib/creative/production/dossier/runtime/CreativeProductionDossierExecutionGate";
import "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate";
import "@/lib/creative/continuity/runtime/CreativeShotContinuationExecutionGate";
import "@/lib/creative/video/runtime/CreativeVisualStateExecutionGate";

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
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  CreativeVisualProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/CreativeVisualProductionGraphRuntime";

import {
  CreativeIdentityKeyframeGraphRuntime,
} from "@/lib/creative/identity/runtime/CreativeIdentityKeyframeGraphRuntime";
import {
  CreativeVisualStateGraphRuntime,
} from "@/lib/creative/video/runtime/CreativeVisualStateGraphRuntime";

import {
  CreativeLipSyncGraphRuntime,
} from "@/lib/creative/performance/runtime/CreativeLipSyncGraphRuntime";

import {
  CreativeGeneratedMediaPerceptualGraphRuntime,
} from "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualGraphRuntime";

import {
  CreativeShotContinuationGraphRuntime,
} from "@/lib/creative/continuity/runtime/CreativeShotContinuationGraphRuntime";

import {
  CreativeShotAssetIsolationGraphRuntime,
} from "@/lib/creative/assets/isolation/runtime/CreativeShotAssetIsolationGraphRuntime";

import {
  CreativeProductionTaskMaterializationRuntime,
} from "@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime";

import {
  createProductionGraph,
} from "../documents/ProductionGraph";
import {
  evaluateProductionOffice,
  advanceProductionOffice,
} from "@/lib/creative/production-room/runtime/CreativeProductionOfficeRuntime";
import {
  createCurrentRoomWorkOrders,
  completeProductionWorkOrder,
} from "@/lib/creative/production-room/runtime/CreativeProductionWorkOrderRuntime";
import {
  executeSpecialistExecutionWave,
} from "@/lib/creative/production-room/runtime/CreativeProductionSpecialistSchedulerRuntime";
import {
  mergeSpecialistWaveState,
} from "@/lib/creative/production-room/runtime/CreativeProductionSpecialistWaveStateRuntime";
import {
  decideProductionRoomAutonomy,
} from "@/lib/creative/production-room/runtime/CreativeProductionRoomAutonomyRuntime";
import {
  runBoundedProductionRoomAutopilot,
} from "@/lib/creative/production-room/runtime/CreativeProductionRoomAutopilotRuntime";

import * as Repository
from "../repositories/ProductionGraphRepository";

import {
  productionHandoffKey,
  assertTemporalProductionHandoff,
  CREATIVE_PRODUCTION_HANDOFF_IDENTITY_CONTRACT,
} from "./CreativeProductionGraphHandoffIdentity.js";

const TASK_MATERIALIZATION_GRAPH_CONTRACT =
  "CREATIVE_PRODUCTION_TASK_MATERIALIZATION_GRAPH_V2";

function workflowKind(input = {}) {
  return String(input.creative_plan?.workflow_kind || "")
    .trim()
    .toUpperCase();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

const GRAPH_APPROVAL_METADATA_KEYS = new Set([
  "production_approval_contract",
  "production_dossier_approval_record_asset_node_id",
  "approved_dossier_hash",
  "approved_plan_hash",
  "approved_graph_hash",
  "approved_execution_hash",
  "approved_cost_ceiling",
  "production_dossier_human_approved",
  "production_dossier_approved_at",
]);

function sameValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function assertGraphApprovalAbsentOnCreate(input = {}) {
  const status = text(input.status).toUpperCase();
  if (status === "APPROVED" || status === "IN_PRODUCTION" || status === "COMPLETED") {
    throw new Error("PRODUCTION_GRAPH_APPROVAL_CREATE_FORBIDDEN");
  }
  const costPlan = object(input.cost_plan);
  if (costPlan.approved === true || Number(costPlan.approved_cost || 0) > 0) {
    throw new Error("PRODUCTION_GRAPH_COST_APPROVAL_CREATE_FORBIDDEN");
  }
  const metadata = object(input.metadata);
  for (const key of GRAPH_APPROVAL_METADATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      throw new Error(`PRODUCTION_GRAPH_APPROVAL_METADATA_CREATE_FORBIDDEN:${key}`);
    }
  }
}

function assertGenericGraphApprovalMutationAllowed(current = {}, values = {}) {
  const nextStatus = text(values.status).toUpperCase();
  if (nextStatus === "APPROVED") {
    throw new Error("PRODUCTION_GRAPH_APPROVAL_MUTATION_FORBIDDEN");
  }
  const nextCost = object(values.cost_plan);
  if (nextCost.approved === true || Number(nextCost.approved_cost || 0) > 0) {
    throw new Error("PRODUCTION_GRAPH_COST_APPROVAL_MUTATION_FORBIDDEN");
  }
  const currentMetadata = object(current.metadata);
  const nextMetadata = object(values.metadata);
  for (const key of GRAPH_APPROVAL_METADATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(nextMetadata, key) &&
        !sameValue(nextMetadata[key], currentMetadata[key])) {
      throw new Error(`PRODUCTION_GRAPH_APPROVAL_METADATA_MUTATION_FORBIDDEN:${key}`);
    }
  }
}


function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
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

function configuredCurrency(project = {}, plan = {}) {
  const metadata = object(project.metadata);
  const metadataBudget = object(metadata.budget_profile);
  const projectBudget = object(project.budget_profile);
  return text(
    plan.production?.currency ||
    metadata.currency ||
    metadataBudget.currency ||
    projectBudget.currency ||
    "",
  ) || null;
}

function validateConceptCouncil(plan = {}) {
  const council = object(plan.concept_council);
  if (council.contract !== "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1") {
    throw new Error("INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_REQUIRED");
  }
  if (list(council.critic_reports).length < 4) {
    throw new Error("INDEPENDENT_CREATIVE_CRITIC_REPORTS_REQUIRED");
  }
  if (list(council.scorecards).length < 3) {
    throw new Error("INDEPENDENT_CREATIVE_SCORECARDS_REQUIRED");
  }
  const selected = council.scorecards.find((scorecard) =>
    scorecard.concept_id === plan.selected_concept_id,
  );
  if (
    !selected ||
    selected.all_critics_passed !== true ||
    Number(selected.weighted_score || 0) < 76
  ) {
    throw new Error("INDEPENDENT_CREATIVE_SELECTED_CONCEPT_NOT_QUALIFIED");
  }
  if (
    plan.production?.prohibit_self_judged_concept_selection !== true ||
    plan.production?.prohibit_hybrid_concept_selection !== true
  ) {
    throw new Error("INDEPENDENT_CREATIVE_GOVERNANCE_FLAGS_REQUIRED");
  }
  if (
    text(council.council_hash) !== text(plan.production?.concept_council_hash) ||
    text(council.concept_hash) !== text(plan.production?.selected_concept_hash)
  ) {
    throw new Error("INDEPENDENT_CREATIVE_COUNCIL_HASH_MISMATCH");
  }
}

function validateUniversalCreativeContract({ creative_plan = {}, shots = [] } = {}) {
  const plan = object(creative_plan);
  const universal = list(plan.concept_candidates).length >= 3 &&
    Boolean(text(plan.selected_concept_id)) &&
    Boolean(object(plan.music_world));
  if (workflowKind({ creative_plan: plan }) === "TEMPORAL" && !universal) {
    throw new Error("UNIVERSAL_CREATIVE_DOSSIER_REQUIRED_BEFORE_PRODUCTION");
  }
  if (workflowKind({ creative_plan: plan }) === "TEMPORAL") {
    validateConceptCouncil(plan);
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
  if (singing.length && plan.production?.audio_conditioned_lip_sync_required !== true) {
    throw new Error("AUDIO_CONDITIONED_LIPSYNC_GATE_REQUIRED");
  }
}

function approvalMetadata(plan = {}) {
  return {
    approval_plan_snapshot: plan,
    approval_plan_hash: hash(plan),
    concept_council_hash:
      plan.concept_council?.council_hash ||
      plan.production?.concept_council_hash ||
      null,
    selected_concept_hash:
      plan.concept_council?.concept_hash ||
      plan.production?.selected_concept_hash ||
      null,
    measured_audio_evidence_hash:
      plan.measured_audio_intelligence?.evidence_hash ||
      plan.production?.measured_audio_evidence_hash ||
      null,
    identity_atlas_hashes: list(plan.identity_atlases)
      .map((atlas) => atlas.hash || atlas.identity_atlas_hash)
      .filter(Boolean),
    production_dossier_required: true,
    production_dossier_human_approval_required: true,
    generated_media_perceptual_review_required: true,
    generated_media_rejected_before_editing: true,
    strict_shot_asset_isolation_required: true,
    project_asset_pool_exposed_to_providers: false,
    organization_asset_pool_exposed_to_providers: false,
  };
}

function taskMaterializationLineage(graph = {}) {
  return object(
    graph.metadata?.story_lineage ||
    graph.story_lineage,
  );
}

function withTaskMaterializationContracts(graph = {}) {
  const lineage = taskMaterializationLineage(graph);
  const temporal = text(graph.metadata?.workflow_kind).toUpperCase() === "TEMPORAL";
  if (
    temporal &&
    (!text(lineage.story_contract_hash) || !text(lineage.master_plan_hash))
  ) {
    throw new Error("PRODUCTION_TASK_MATERIALIZATION_GRAPH_LINEAGE_REQUIRED");
  }

  const nodes = list(graph.nodes).map((sourceNode) => {
    const node = CreativeProductionTaskMaterializationRuntime.stripPrompts(
      sourceNode,
    );
    if (node.generation?.required !== true) return node;

    if (Object.keys(lineage).length) {
      node.metadata = {
        ...object(node.metadata),
        workflow_kind: node.metadata?.workflow_kind || graph.metadata?.workflow_kind || null,
        story_lineage: lineage,
      };
      node.requirements = {
        ...object(node.requirements),
        story_lineage: lineage,
      };
    }
    CreativeProductionTaskMaterializationRuntime.attach(node);
    const contract = object(
      node.requirements?.task_materialization_contract,
    );
    if (!CreativeProductionTaskMaterializationRuntime.verify(contract)) {
      throw new Error(
        `PRODUCTION_TASK_MATERIALIZATION_CONTRACT_INVALID:${node.id}`,
      );
    }
    if (
      Object.keys(lineage).length &&
      !CreativeProductionTaskMaterializationRuntime.verifyLineage(
        contract,
        lineage,
      )
    ) {
      throw new Error(
        `PRODUCTION_TASK_MATERIALIZATION_LINEAGE_MISMATCH:${node.id}`,
      );
    }
    return node;
  });

  const generationNodes = nodes.filter(
    (node) => node.generation?.required === true,
  );

  return {
    ...graph,
    nodes,
    metadata: {
      ...CreativeProductionTaskMaterializationRuntime.stripPrompts(
        object(graph.metadata),
      ),
      task_materialization_contract:
        TASK_MATERIALIZATION_GRAPH_CONTRACT,
      task_materialization_node_count: generationNodes.length,
      task_materialization_metadata_allowlisted: true,
      task_materialization_idempotent: true,
      task_materialization_lineage_verified:
        !temporal || Object.keys(lineage).length > 0,
      task_materialization_provider_ids_preserved: true,
      task_materialization_human_review_preserved: true,
      provider_prompts_persisted_in_graph: false,
      provider_prompts_persisted_in_materialization_contracts: false,
    },
  };
}

async function buildPlannedGraph(input = {}) {
  const project = await CreativeProjectRuntime.get(input.creative_project_id);
  if (!project || String(project.organization_id) !== String(input.organization_id)) {
    throw new Error("Creative project not found");
  }
  const currency = configuredCurrency(project, input.creative_plan);
  const kind = workflowKind(input);

  if (kind && kind !== "TEMPORAL") {
    const universalGraph = buildUniversalProductionGraph(input);
    universalGraph.status = "PLANNED";
    universalGraph.cost_plan = {
      ...object(universalGraph.cost_plan),
      currency,
      approval_required: true,
      approved: false,
    };
    return universalGraph;
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

  const baseGraph = buildProductionGraph({
    ...input,
    ...performanceBound,
  });

  const visualGraph = CreativeVisualProductionGraphRuntime.apply({
    graph: baseGraph,
    shots: performanceBound.shots,
  });

  const visualStateGraph = CreativeVisualStateGraphRuntime.apply({
    graph: visualGraph,
  });

  const keyframeGraph = CreativeIdentityKeyframeGraphRuntime.apply({
    graph: visualStateGraph,
    shots: performanceBound.shots,
  });

  const lipSyncGraph = CreativeLipSyncGraphRuntime.apply({
    graph: keyframeGraph,
    shots: performanceBound.shots,
  });

  const perceptualGraph = CreativeGeneratedMediaPerceptualGraphRuntime.apply({
    graph: lipSyncGraph,
    shots: performanceBound.shots,
  });

  const continuationGraph = CreativeShotContinuationGraphRuntime.apply({
    graph: perceptualGraph,
    shots: performanceBound.shots,
  });

  const finalGraph = CreativeShotAssetIsolationGraphRuntime.apply({
    graph: continuationGraph,
    project_assets: assets,
  });
  finalGraph.metadata = {
    ...object(finalGraph.metadata),
    ...approvalMetadata(input.creative_plan),
    planning_mode: "PURE_IN_MEMORY_BEFORE_MATERIALIZATION",
  };
  finalGraph.cost_plan = {
    ...object(finalGraph.cost_plan),
    currency,
    approval_required: true,
    approved: false,
  };
  finalGraph.status = "PLANNED";

  return finalGraph;
}

export const ProductionGraphRuntime = {
  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async get(id) {
    return Repository.getById(id);
  },

  async create(input = {}) {
    assertGraphApprovalAbsentOnCreate(input);
    const graph = createProductionGraph(withTaskMaterializationContracts(input));
    assertTemporalProductionHandoff(graph);
    const handoffKey = productionHandoffKey(graph);
    if (!handoffKey) return Repository.create(graph);

    graph.metadata = {
      ...object(graph.metadata),
      production_handoff_contract: CREATIVE_PRODUCTION_HANDOFF_IDENTITY_CONTRACT,
      production_handoff_key: handoffKey,
    };

    const existing = await Repository.getByHandoffKey({
      organization_id: graph.organization_id,
      creative_project_id: graph.creative_project_id,
      production_handoff_key: handoffKey,
    });
    if (existing) return existing;

    try {
      return await Repository.create(graph);
    } catch (error) {
      if (String(error?.code || "") !== "23505") throw error;
      const raced = await Repository.getByHandoffKey({
        organization_id: graph.organization_id,
        creative_project_id: graph.creative_project_id,
        production_handoff_key: handoffKey,
      });
      if (raced) return raced;
      throw error;
    }
  },

  async update(id, values = {}) {
    const current = await Repository.getById(id);
    if (!current) throw new Error("PRODUCTION_GRAPH_NOT_FOUND");
    assertGenericGraphApprovalMutationAllowed(current, values);
    if (!Array.isArray(values.nodes)) {
      return Repository.update(id, values);
    }

    const nextStatus = text(values.status || current?.status).toUpperCase();
    if (nextStatus && nextStatus !== "PLANNED" && nextStatus !== "PLANNING") {
      return Repository.update(
        id,
        values,
      );
    }

    const prepared = withTaskMaterializationContracts({
      ...object(current),
      ...values,
      nodes: values.nodes,
      metadata: {
        ...object(current?.metadata),
        ...object(values.metadata),
      },
    });

    return Repository.update(
      id,
      {
        ...values,
        nodes: prepared.nodes,
        metadata: prepared.metadata,
      },
    );
  },

  async recordProductionWorkstream(id, { stage_id, report } = {}) {
    const current = await Repository.getById(id);
    if (!current) throw new Error("PRODUCTION_GRAPH_NOT_FOUND");
    const stageId = text(stage_id).toUpperCase();
    if (!stageId) throw new Error("PRODUCTION_ROOM_STAGE_REQUIRED");
    if (report?.contract !== "CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_V1") {
      throw new Error("PRODUCTION_ROOM_WORKSTREAM_CONTRACT_REQUIRED");
    }
    const requirement = Number(report.requirement);
    if (!Number.isInteger(requirement) || requirement < 1 || requirement > 20) {
      throw new Error("PRODUCTION_ROOM_WORKSTREAM_REQUIREMENT_INVALID");
    }

    const metadata = object(current.metadata);
    const reportsByStage = { ...object(metadata.production_room_workstream_reports) };
    const stageReports = list(reportsByStage[stageId])
      .filter((item) => Number(item.requirement) !== requirement);
    reportsByStage[stageId] = [...stageReports, report];
    const roomPlan = metadata.production_room_pipeline;
    if (!roomPlan?.contract) throw new Error("PRODUCTION_ROOM_PIPELINE_REQUIRED");
    const office = evaluateProductionOffice({ plan: roomPlan, reports_by_stage: reportsByStage });
    const workOrders = createCurrentRoomWorkOrders({ office, reports_by_stage: reportsByStage });
    return Repository.updateIfUnchanged(id, {
      metadata: {
        ...metadata,
        production_room_workstream_reports: reportsByStage,
        production_office: office,
        production_work_orders: workOrders,
      },
    }, current.updated_at);
  },

  async completeProductionWorkOrder(id, { stage_id, work_order, evidence = {} } = {}) {
    const completion = completeProductionWorkOrder({ work_order, evidence });
    const graph = await this.recordProductionWorkstream(id, {
      stage_id,
      report: completion.workstream_report,
    });
    return {
      graph,
      completion,
    };
  },

  async executeProductionSpecialistWave(id, {
    organization_id,
    creative_project_id,
    production_context = {},
    max_concurrency = 4,
    execution_runtime,
  } = {}) {
    const current = await Repository.getById(id);
    if (!current) throw new Error("PRODUCTION_GRAPH_NOT_FOUND");
    if (String(current.organization_id || "") !== String(organization_id || "")) {
      throw new Error("PRODUCTION_GRAPH_ORGANIZATION_MISMATCH");
    }
    if (String(current.creative_project_id || "") !== String(creative_project_id || "")) {
      throw new Error("PRODUCTION_GRAPH_PROJECT_MISMATCH");
    }
    const metadata = object(current.metadata);
    const roomPlan = metadata.production_room_pipeline;
    if (!roomPlan?.contract) throw new Error("PRODUCTION_ROOM_PIPELINE_REQUIRED");
    const reportsByStage = object(metadata.production_room_workstream_reports);
    const office = evaluateProductionOffice({ plan: roomPlan, reports_by_stage: reportsByStage });
    const workOrders = createCurrentRoomWorkOrders({ office, reports_by_stage: reportsByStage });
    const wave = await executeSpecialistExecutionWave({
      organization_id,
      creative_project_id,
      work_orders: workOrders.work_orders,
      production_context,
      max_concurrency,
      execution_runtime,
    });
    const merged = mergeSpecialistWaveState({
      production_room_pipeline: roomPlan,
      reports_by_stage: reportsByStage,
      prior_audit: metadata.production_specialist_wave_audit,
      wave_result: wave,
    });
    const graph = await Repository.updateIfUnchanged(id, {
      metadata: {
        ...metadata,
        production_room_workstream_reports: merged.reports_by_stage,
        production_specialist_wave_audit: merged.specialist_wave_audit,
        production_office: merged.production_office,
        production_work_orders: merged.production_work_orders,
      },
    }, current.updated_at);
    return { graph, wave, merged };
  },

  async runProductionRoomAutonomyStep(id, {
    organization_id,
    creative_project_id,
    production_context = {},
    max_concurrency = 4,
    execution_runtime,
  } = {}) {
    const current = await Repository.getById(id);
    if (!current) throw new Error("PRODUCTION_GRAPH_NOT_FOUND");
    if (String(current.organization_id || "") !== String(organization_id || "")) {
      throw new Error("PRODUCTION_GRAPH_ORGANIZATION_MISMATCH");
    }
    if (String(current.creative_project_id || "") !== String(creative_project_id || "")) {
      throw new Error("PRODUCTION_GRAPH_PROJECT_MISMATCH");
    }
    const metadata = object(current.metadata);
    const decision = decideProductionRoomAutonomy({
      production_room_pipeline: metadata.production_room_pipeline,
      production_room_stage_inputs: metadata.production_room_stage_inputs,
      reports_by_stage: metadata.production_room_workstream_reports,
    });
    if (decision.action === "EXECUTE_SPECIALIST_WAVE") {
      const result = await this.executeProductionSpecialistWave(id, {
        organization_id,
        creative_project_id,
        production_context,
        max_concurrency,
        execution_runtime,
      });
      return { action: decision.action, decision, ...result };
    }
    if (decision.action === "SEAL_CURRENT_ROOM") {
      const graph = await this.advanceProductionRoom(id, {
        stage_id: decision.stage_id,
        evidence: decision.evidence_assembly.evidence,
      });
      return { action: decision.action, decision, graph };
    }
    return { action: decision.action, decision, graph: current };
  },

  async runProductionRoomAutonomy(id, {
    organization_id,
    creative_project_id,
    production_context = {},
    max_concurrency = 4,
    max_steps = 12,
    execution_runtime,
  } = {}) {
    return runBoundedProductionRoomAutopilot({
      max_steps,
      step: async () => this.runProductionRoomAutonomyStep(id, {
        organization_id,
        creative_project_id,
        production_context,
        max_concurrency,
        execution_runtime,
      }),
    });
  },

  async advanceProductionRoom(id, { stage_id, evidence = {} } = {}) {
    const current = await Repository.getById(id);
    if (!current) throw new Error("PRODUCTION_GRAPH_NOT_FOUND");
    const metadata = object(current.metadata);
    const roomPlan = metadata.production_room_pipeline;
    if (!roomPlan?.contract) throw new Error("PRODUCTION_ROOM_PIPELINE_REQUIRED");
    const stageId = text(stage_id).toUpperCase();
    const reportsByStage = object(metadata.production_room_workstream_reports);
    const advanced = advanceProductionOffice({
      plan: roomPlan,
      stage_id: stageId,
      evidence,
      workstream_reports: list(reportsByStage[stageId]),
    });
    const office = evaluateProductionOffice({
      plan: advanced.production_room_pipeline,
      reports_by_stage: reportsByStage,
    });
    const workOrders = createCurrentRoomWorkOrders({ office, reports_by_stage: reportsByStage });
    return Repository.updateIfUnchanged(id, {
      metadata: {
        ...metadata,
        production_room_pipeline: advanced.production_room_pipeline,
        production_room_entry_gate: office.production_entry_gate,
        production_office: office,
        production_work_orders: workOrders,
      },
    }, current.updated_at);
  },

  async preview(input = {}) {
    return buildPlannedGraph(input);
  },

  async plan(input = {}) {
    return this.create(
      await buildPlannedGraph(input),
    );
  },
};

export const ProductionGraphPlanningRuntime = Object.freeze({
  build: buildPlannedGraph,
  validateUniversalCreativeContract,
  contract: "PURE_PRODUCTION_GRAPH_PLANNING_V1",
});