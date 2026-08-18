import crypto from "node:crypto";

import "@/lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime";
import "@/lib/creative/director/runtime/CreativeShortFormTemporalPlanningRuntime";
import "@/lib/creative/director/runtime/CreativeUniversalReferenceCastingRuntime";
import "@/lib/creative/director/runtime/CreativeFreshDirectionReferenceContractRuntime";
import "@/lib/creative/director/runtime/CreativeCanonicalShotSourceRuntime";

import {
  CreativeUniversalTemporalDirectionRuntime,
} from "@/lib/creative/director/runtime/CreativeUniversalTemporalDirectionRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as ResearchRepository
from "@/lib/creative/research/repositories/ResearchRepository";
import * as ProductionGraphRepository
from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

export const DIRECTION_JOB_CONTRACT =
  "CREATIVE_PROJECT_DIRECTION_JOB_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function duration(project = {}, payload = {}) {
  const supplied = object(payload.brief);
  return finite(
    supplied.duration_seconds ??
    project.target_duration ??
    project.metadata?.temporal_contract?.duration_seconds,
    null,
  );
}

function approvedResearch(project = {}) {
  const approval = object(project.metadata?.paid_research_approval);
  if (
    approval.approved !== true ||
    text(approval.status).toUpperCase() !== "COMPLETED" ||
    !text(approval.research_report_id)
  ) {
    throw new Error("CREATIVE_COMPLETED_RESEARCH_REQUIRED_FOR_DIRECTION");
  }
  return approval;
}

function approvedDirection(project = {}) {
  const approval = object(project.metadata?.paid_direction_approval);
  const status = text(approval.status).toUpperCase();
  const expiresAt = Date.parse(text(approval.expires_at));

  if (text(approval.contract) !== "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2") {
    throw new Error("CREATIVE_DIRECTION_APPROVAL_CONTRACT_REQUIRED");
  }
  if (approval.approved !== true) {
    throw new Error("CREATIVE_PAID_DIRECTION_APPROVAL_REQUIRED");
  }
  if (!["APPROVED", "IN_PROGRESS"].includes(status)) {
    throw new Error("CREATIVE_DIRECTION_APPROVAL_NOT_ACTIVE");
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("CREATIVE_DIRECTION_APPROVAL_EXPIRED");
  }
  if (
    text(approval.command_identity) !==
    text(project.metadata?.command_identity)
  ) {
    throw new Error("CREATIVE_DIRECTION_APPROVAL_COMMAND_IDENTITY_MISMATCH");
  }
  return approval;
}

function verifiedResearch(report = {}, project = {}) {
  if (!report?.id) throw new Error("CREATIVE_RESEARCH_REPORT_NOT_FOUND");
  if (text(report.organization_id) !== text(project.organization_id)) {
    throw new Error("CREATIVE_DIRECTION_RESEARCH_ORGANIZATION_MISMATCH");
  }
  if (text(report.creative_project_id) !== text(project.id)) {
    throw new Error("CREATIVE_DIRECTION_RESEARCH_PROJECT_MISMATCH");
  }
  if (report.metadata?.validation?.passed !== true) {
    throw new Error("CREATIVE_DIRECTION_RESEARCH_VALIDATION_REQUIRED");
  }
  return report;
}

function researchForBrief(report = {}) {
  return {
    research_report_id: report.id,
    contract:
      report.metadata?.research_contract ||
      report.metadata?.contract ||
      null,
    research_identity: report.metadata?.research_identity || null,
    context_identity: report.metadata?.context_identity || null,
    summary: report.summary || "",
    company_resolution: report.metadata?.company_resolution || {},
    company_truth: report.company_truth || {},
    brand_intelligence: report.brand_intelligence || {},
    audience: report.audience || {},
    commercial_intelligence: report.commercial_intelligence || {},
    messaging: report.messaging || {},
    creative_opportunities: report.creative_opportunities || {},
    recommendations: report.recommendations || {},
    trends: report.trends || {},
    keywords: report.keywords || [],
    claims: report.claims || [],
    sources: report.sources || [],
    confidence: report.confidence ?? null,
    validation: report.metadata?.validation || {},
  };
}

function directionBrief(project = {}, report = {}, payload = {}) {
  const supplied = object(payload.brief);
  const metadata = object(project.metadata);
  const targetDuration = duration(project, payload);
  if (!targetDuration || targetDuration <= 0) {
    throw new Error("CREATIVE_DIRECTION_DURATION_REQUIRED");
  }

  return {
    ...supplied,
    creative_objective:
      text(supplied.creative_objective) ||
      text(project.objective) ||
      text(metadata.creative_request),
    business_goal:
      text(supplied.business_goal) ||
      text(project.objective) ||
      text(metadata.creative_request),
    duration_seconds: targetDuration,
    target_duration: targetDuration,
    research: researchForBrief(report),
    metadata: {
      ...object(supplied.metadata),
      creative_request: text(metadata.creative_request) || null,
      command_identity: text(metadata.command_identity) || null,
      organization_name: text(metadata.organization_name) || null,
      organization_industry: text(metadata.organization_industry) || null,
      selected_asset_ids: list(metadata.selected_asset_ids),
      research_report_id: report.id,
      research_identity: report.metadata?.research_identity || null,
      research_context_identity: report.metadata?.context_identity || null,
      research_validation: report.metadata?.validation || {},
      research: researchForBrief(report),
      production_authorized: false,
      media_generation_authorized: false,
      publication_authorized: false,
    },
  };
}

function planDuration(plan = {}) {
  return list(plan.scenes).reduce(
    (sum, scene) => sum + Number(scene?.duration_seconds || 0),
    0,
  );
}

function shotDuration(scene = {}) {
  return list(scene.shots).reduce(
    (sum, shot) => sum + Number(shot?.duration_seconds || 0),
    0,
  );
}

function exactDuration(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= 0.001;
}

function assertDirectionPlan(plan = {}, targetDuration) {
  if (!plan.validation?.passed) {
    throw new Error("CREATIVE_DIRECTION_MASTER_PLAN_VALIDATION_REQUIRED");
  }
  if (plan.degraded === true || plan.release_blocked === true) {
    throw new Error("CREATIVE_DIRECTION_DEGRADED_PLAN_REJECTED");
  }
  const scenes = list(plan.scenes);
  if (!scenes.length) throw new Error("CREATIVE_DIRECTION_SCENES_REQUIRED");
  if (!exactDuration(planDuration(plan), targetDuration)) {
    throw new Error("CREATIVE_DIRECTION_MASTER_DURATION_MISMATCH");
  }
  for (const [index, scene] of scenes.entries()) {
    const shots = list(scene.shots);
    if (!shots.length) {
      throw new Error(`CREATIVE_DIRECTION_SCENE_SHOTS_REQUIRED:${index + 1}`);
    }
    if (!exactDuration(shotDuration(scene), scene.duration_seconds)) {
      throw new Error(
        `CREATIVE_DIRECTION_SCENE_SHOT_DURATION_MISMATCH:${index + 1}`,
      );
    }
  }
  return plan;
}

function directionHash({ project, researchReport, approval }) {
  const metadata = object(project.metadata);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      creative_project_id: project.id,
      command_identity: text(metadata.command_identity),
      target_duration: finite(project.target_duration, null),
      research_report_id: researchReport?.id || null,
      research_identity: researchReport?.metadata?.research_identity || null,
      direction_approval_id: approval?.id || null,
      selected_asset_ids: list(metadata.selected_asset_ids).map(text).sort(),
      contract: DIRECTION_JOB_CONTRACT,
    }))
    .digest("hex");
}

export async function prepareProjectDirection({
  organization_id,
  creative_project_id,
  creative_mission_id = null,
  payload = {},
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const project = await CreativeProjectRuntime.get(creative_project_id);
  if (!project || text(project.organization_id) !== text(organization_id)) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const researchApproval = approvedResearch(project);
  const directionApproval = approvedDirection(project);
  const report = verifiedResearch(
    await ResearchRepository.get(researchApproval.research_report_id),
    project,
  );

  const missionId =
    text(creative_mission_id) ||
    text(project.creative_mission_id) ||
    null;
  const mission = missionId
    ? await CreativeMissionRuntime.get(missionId)
    : null;
  if (mission && text(mission.organization_id) !== text(organization_id)) {
    throw new Error("JOB_CONTEXT_MISMATCH:MISSION_ORGANIZATION");
  }

  const assets = await CreativeAssetsRuntime.list({
    organization_id,
    creative_project_id,
    creative_mission_id: missionId,
    limit: 1000,
  });
  const selectedAssetIds = new Set(
    list(project.metadata?.selected_asset_ids).map(text),
  );
  const selectedAssets = selectedAssetIds.size
    ? assets.filter((asset) => selectedAssetIds.has(text(asset.id)))
    : assets;
  if (!selectedAssets.length) {
    throw new Error("CREATIVE_DIRECTION_SELECTED_ASSETS_REQUIRED");
  }

  return {
    project,
    mission: mission || {},
    mission_id: missionId,
    research_report: report,
    research_approval: researchApproval,
    direction_approval: directionApproval,
    assets: selectedAssets,
    brief: directionBrief(project, report, payload),
    target_duration: duration(project, payload),
    direction_hash: directionHash({
      project,
      researchReport: report,
      approval: directionApproval,
    }),
  };
}

export async function executeProjectDirection({
  job,
  controls,
  payload = {},
} = {}) {
  const prepared = await prepareProjectDirection({
    organization_id: job.organization_id,
    creative_project_id: job.creative_project_id,
    creative_mission_id: payload.creative_mission_id,
    payload,
  });

  const [graphsBefore, tasksBefore] = await Promise.all([
    ProductionGraphRepository.listByProject({
      organization_id: job.organization_id,
      creative_project_id: job.creative_project_id,
    }),
    ProductionTaskRuntime.list({
      organization_id: job.organization_id,
      creative_project_id: job.creative_project_id,
    }),
  ]);

  await controls.heartbeat({
    stage: "DIRECTING_PROJECT",
    message: "Building the exact-duration governed Creative master video plan",
    creative_mission_id: prepared.mission_id,
    research_report_id: prepared.research_report.id,
    direction_approval_id: prepared.direction_approval.id,
    direction_contract: DIRECTION_JOB_CONTRACT,
    target_duration_seconds: prepared.target_duration,
    selected_asset_count: prepared.assets.length,
    graph_count_before: graphsBefore.length,
    task_count_before: tasksBefore.length,
    production_started: false,
  });

  const result = await CreativeUniversalTemporalDirectionRuntime.create({
    organization_id: job.organization_id,
    mission: prepared.mission,
    project: prepared.project,
    brief: prepared.brief,
    assets: prepared.assets,
  });
  const plan = assertDirectionPlan(result.plan, prepared.target_duration);

  const [graphsAfter, tasksAfter] = await Promise.all([
    ProductionGraphRepository.listByProject({
      organization_id: job.organization_id,
      creative_project_id: job.creative_project_id,
    }),
    ProductionTaskRuntime.list({
      organization_id: job.organization_id,
      creative_project_id: job.creative_project_id,
    }),
  ]);

  if (graphsAfter.length !== graphsBefore.length) {
    throw new Error(
      `CREATIVE_DIRECTION_GRAPH_MUTATION_DETECTED:${graphsBefore.length}:${graphsAfter.length}`,
    );
  }
  if (tasksAfter.length !== tasksBefore.length) {
    throw new Error(
      `CREATIVE_DIRECTION_TASK_MUTATION_DETECTED:${tasksBefore.length}:${tasksAfter.length}`,
    );
  }

  const sceneCount = list(plan.scenes).length;
  const shotCount = list(plan.scenes).reduce(
    (sum, scene) => sum + list(scene.shots).length,
    0,
  );

  return {
    contract: DIRECTION_JOB_CONTRACT,
    direction_hash: prepared.direction_hash,
    research_report_id: prepared.research_report.id,
    research_identity:
      prepared.research_report.metadata?.research_identity || null,
    direction_approval_id: prepared.direction_approval.id,
    target_duration_seconds: prepared.target_duration,
    scene_count: sceneCount,
    shot_count: shotCount,
    graph_count_before: graphsBefore.length,
    graph_count_after: graphsAfter.length,
    task_count_before: tasksBefore.length,
    task_count_after: tasksAfter.length,
    provider: result.provider || null,
    model: result.model || null,
    usage: result.usage || null,
    billing: result.billing || null,
    validation: result.validation || plan.validation || null,
    universal_reference_casting:
      result.universal_reference_casting || null,
    universal_asset_intelligence:
      result.universal_asset_intelligence || null,
    plan,
    production_started: false,
    media_generation_authorized: false,
    publication_authorized: false,
  };
}

export const CreativeProjectDirectionRuntime = Object.freeze({
  contract: DIRECTION_JOB_CONTRACT,
  prepare: prepareProjectDirection,
  execute: executeProjectDirection,
});
