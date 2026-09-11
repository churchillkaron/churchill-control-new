import crypto from "node:crypto";

import {
  CREATIVE_PRODUCTION_ROOM_STAGES,
  PREPRODUCTION_GATE_STAGE,
  PRODUCTION_ENTRY_STAGE,
} from "../registry/CreativeProductionRoomStageRegistry.js";
import {
  specialistsForStage,
} from "../registry/CreativeVirtualProductionSpecialistRegistry.js";
import { CREATIVE_RESEARCH_ROOM_ADAPTER_CONTRACT } from "./CreativeResearchRoomAdapterRuntime.js";
import { CREATIVE_FRONT_PRODUCTION_ROOMS_CONTRACT } from "./CreativeFrontProductionRoomsRuntime.js";
import { CREATIVE_TECHNICAL_SCOUT_CONTRACT } from "./CreativeTechnicalScoutRuntime.js";
import { CREATIVE_DEPARTMENT_BREAKDOWN_CONTRACT } from "./CreativeDepartmentBreakdownRuntime.js";
import { CREATIVE_VIRTUAL_REHEARSAL_CONTRACT } from "./CreativeVirtualRehearsalRuntime.js";
import { CREATIVE_DAILIES_ROOM_CONTRACT } from "./CreativeDailiesRoomRuntime.js";
import { CREATIVE_POST_ROOM_QUALITY_CONTRACT } from "./CreativePostRoomQualityRuntime.js";
import { CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_CONTRACT } from "./CreativeVirtualProductionWorkstreamRuntime.js";

export const CREATIVE_PRODUCTION_ROOM_CONTRACT = "CREATIVE_PRODUCTION_ROOM_PIPELINE_V1";

const TRUSTED_UPSTREAM_HANDOFF_STAGES = new Set([
  "RESEARCH_ROOM",
  "CREATIVE_FLOOR",
  "CONCEPT_COMPETITION",
  "TRIBUNAL",
]);

function assertTrustedUpstreamHandoff(stageId, report = {}) {
  if (!TRUSTED_UPSTREAM_HANDOFF_STAGES.has(stageId)) {
    throw new Error(`CREATIVE_PRODUCTION_ROOM_TRUSTED_HANDOFF_FORBIDDEN:${stageId}`);
  }
  if (stageId === "RESEARCH_ROOM") {
    if (report.contract !== CREATIVE_RESEARCH_ROOM_ADAPTER_CONTRACT || report.passed !== true) {
      throw new Error("CREATIVE_RESEARCH_ROOM_REPORT_REQUIRED");
    }
    return;
  }
  if (["CREATIVE_FLOOR", "CONCEPT_COMPETITION"].includes(stageId)) {
    if (report.contract !== CREATIVE_FRONT_PRODUCTION_ROOMS_CONTRACT || report.room !== stageId || report.passed !== true) {
      throw new Error(`CREATIVE_${stageId}_REPORT_REQUIRED`);
    }
    return;
  }
  if (report.contract !== "CREATIVE_DYNAMIC_TRIBUNAL_V1" || report.passed !== true || report.verdict?.passed !== true) {
    throw new Error("CREATIVE_TRIBUNAL_REPORT_REQUIRED");
  }
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}function requiredEvidenceKeys(stageId) {
  return ({
    RESEARCH_ROOM: ["research_packet", "source_manifest", "open_questions"],
    CREATIVE_FLOOR: ["task_truth", "human_truth", "place_truth", "sonic_thesis", "look_thesis"],
    CONCEPT_COMPETITION: ["concept_candidates", "critic_reports", "selected_concept"],
    TRIBUNAL: ["panel", "reviews", "verdict"],
    TECHNICAL_SCOUT: ["location_truth", "technical_truth", "materials_truth", "weather_light_truth"],
    PREVIS: ["shot_blueprints", "editorial_precheck", "coverage_plan", "effects_strategy"],
    DEPARTMENT_BREAKDOWN: ["department_assignments", "dependencies", "schedule", "cost_risks"],
    VIRTUAL_REHEARSAL: ["action_rehearsal", "camera_rehearsal", "continuity_rehearsal", "editability_proof"],
    PRODUCTION_UNITS: ["takes", "unit_reports", "capture_lineage"],
    DAILIES: ["department_reviews", "rejections", "approved_takes"],
    EDITORIAL: ["assembly", "coverage_gaps", "edit_decisions"],
    VFX: ["shot_versions", "integration_reviews", "approved_vfx"],
    COLOR: ["look_continuity", "shot_matches", "approved_grade"],
    SOUND_MUSIC: ["sound_world", "music_edit", "mix_review", "approved_mix"],
    MASTER_DIRECTOR_REVIEW: ["director_verdict", "weakest_link_review", "final_repairs"],
    MASTERING: ["mastering_inspection", "render", "quality", "audio_integrity"],
    RELEASE: ["master_qc", "rights_clearance", "delivery_approval"],
  })[stageId] || [];
}

function stageWorkstreamRequirements(stageId) {
  return [...new Set(specialistsForStage(stageId).map((specialist) => specialist.requirement))].sort((a, b) => a - b);
}

function specialistIds(stageId) {
  return specialistsForStage(stageId).map((specialist) => specialist.id);
}

function assertStageWorkstreamReports(stageId, evidence = {}) {
  const required = stageWorkstreamRequirements(stageId);
  const reports = list(evidence.workstream_reports);
  for (const requirement of required) {
    const report = reports.find((item) => Number(item?.requirement) === requirement);
    if (!report || report.contract !== CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_CONTRACT || report.passed !== true) {
      throw new Error(`CREATIVE_PRODUCTION_ROOM_WORKSTREAM_REPORT_REQUIRED:${stageId}:${requirement}`);
    }
  }
}

function assertSpecializedRoomReport(stageId, evidence = {}) {
  const report = evidence.room_report || evidence.report || evidence.research_room_report || {};
  if (stageId === "RESEARCH_ROOM") {
    if (report.contract !== CREATIVE_RESEARCH_ROOM_ADAPTER_CONTRACT || report.passed !== true) {
      throw new Error("CREATIVE_RESEARCH_ROOM_REPORT_REQUIRED");
    }
    return;
  }
  if (["CREATIVE_FLOOR", "CONCEPT_COMPETITION"].includes(stageId)) {
    if (report.contract !== CREATIVE_FRONT_PRODUCTION_ROOMS_CONTRACT || report.room !== stageId || report.passed !== true) {
      throw new Error(`CREATIVE_${stageId}_REPORT_REQUIRED`);
    }
    return;
  }
  if (stageId === "TRIBUNAL") {
    if (report.contract !== "CREATIVE_DYNAMIC_TRIBUNAL_V1" || report.passed !== true || !report.verdict?.passed) {
      throw new Error("CREATIVE_TRIBUNAL_REPORT_REQUIRED");
    }
    return;
  }
  if (stageId === "TECHNICAL_SCOUT") {
    if (report.contract !== CREATIVE_TECHNICAL_SCOUT_CONTRACT || report.passed !== true || report.zero_provider_calls !== true || report.zero_media_generation !== true) {
      throw new Error("CREATIVE_TECHNICAL_SCOUT_REPORT_REQUIRED");
    }
    return;
  }
  if (stageId === "DEPARTMENT_BREAKDOWN") {
    if (report.contract !== CREATIVE_DEPARTMENT_BREAKDOWN_CONTRACT || report.passed !== true || report.zero_provider_calls !== true || report.zero_media_generation !== true) {
      throw new Error("CREATIVE_DEPARTMENT_BREAKDOWN_REPORT_REQUIRED");
    }
    return;
  }
  if (stageId === "VIRTUAL_REHEARSAL") {
    if (report.contract !== CREATIVE_VIRTUAL_REHEARSAL_CONTRACT || report.passed !== true || report.zero_provider_calls !== true || report.zero_media_generation !== true) {
      throw new Error("CREATIVE_VIRTUAL_REHEARSAL_REPORT_REQUIRED");
    }
    return;
  }
  if (stageId === "DAILIES") {
    if (report.contract !== CREATIVE_DAILIES_ROOM_CONTRACT || report.passed !== true) {
      throw new Error("CREATIVE_DAILIES_REPORT_REQUIRED");
    }
    return;
  }
  if (stageId === "MASTERING") {
    if (report.contract !== "CREATIVE_MASTERING_INSPECTION_V1" || !report.render || Number(report.production?.incomplete_count || 0) > 0) {
      throw new Error("CREATIVE_MASTERING_INSPECTION_REQUIRED");
    }
    return;
  }
  if (["EDITORIAL", "VFX", "COLOR", "SOUND_MUSIC", "MASTER_DIRECTOR_REVIEW", "RELEASE"].includes(stageId)) {
    if (report.contract !== CREATIVE_POST_ROOM_QUALITY_CONTRACT || report.room !== stageId || report.passed !== true) {
      throw new Error(`CREATIVE_${stageId}_REPORT_REQUIRED`);
    }
  }
}

export function createProductionRoomPlan({ project_id = null, master_plan_digest = null } = {}) {
  const stages = CREATIVE_PRODUCTION_ROOM_STAGES.map((stage) => Object.freeze({
    ...stage,
    status: stage.order === 1 ? "READY" : "BLOCKED",
    required_evidence: requiredEvidenceKeys(stage.id),
    required_workstream_requirements: stageWorkstreamRequirements(stage.id),
    specialist_ids: specialistIds(stage.id),
  }));
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_ROOM_CONTRACT,
    project_id,
    master_plan_digest,
    stages,
    zero_media_generation: true,
  });
}
export function sealTrustedUpstreamProductionRoomStage({ plan = {}, stage_id, report = null, previous_stage_digest = null } = {}) {
  if (plan.contract !== CREATIVE_PRODUCTION_ROOM_CONTRACT) {
    throw new Error("CREATIVE_PRODUCTION_ROOM_PLAN_REQUIRED");
  }
  const stageId = text(stage_id).toUpperCase();
  const stage = list(plan.stages).find((item) => item.id === stageId);
  if (!stage) throw new Error(`CREATIVE_PRODUCTION_ROOM_STAGE_UNKNOWN:${stageId}`);
  assertTrustedUpstreamHandoff(stageId, object(report));

  const prior = list(plan.stages).filter((item) => item.order < stage.order);
  const expectedPrevious = prior.at(-1)?.sealed_digest || null;
  if (stage.order > 1 && (!expectedPrevious || previous_stage_digest !== expectedPrevious)) {
    throw new Error(`CREATIVE_PRODUCTION_ROOM_STAGE_ORDER_VIOLATION:${stageId}`);
  }

  const sealedDigest = digest({
    contract: CREATIVE_PRODUCTION_ROOM_CONTRACT,
    stage_id: stageId,
    previous_stage_digest: expectedPrevious,
    trusted_upstream_report: report,
  });
  const stages = list(plan.stages).map((item) => {
    if (item.id === stageId) return Object.freeze({ ...item, status: "SEALED", trusted_upstream_handoff: true, report, sealed_digest: sealedDigest });
    if (item.order === stage.order + 1) return Object.freeze({ ...item, status: "READY" });
    return item;
  });
  return Object.freeze({ ...plan, stages, zero_media_generation: true });
}

export function sealProductionRoomStage({ plan = {}, stage_id, evidence = {}, previous_stage_digest = null } = {}) {
  if (plan.contract !== CREATIVE_PRODUCTION_ROOM_CONTRACT) {
    throw new Error("CREATIVE_PRODUCTION_ROOM_PLAN_REQUIRED");
  }
  const stageId = text(stage_id).toUpperCase();
  const stage = list(plan.stages).find((item) => item.id === stageId);
  if (!stage) throw new Error(`CREATIVE_PRODUCTION_ROOM_STAGE_UNKNOWN:${stageId}`);

  const prior = list(plan.stages).filter((item) => item.order < stage.order);
  const expectedPrevious = prior.at(-1)?.sealed_digest || null;
  if (stage.order > 1 && (!expectedPrevious || previous_stage_digest !== expectedPrevious)) {
    throw new Error(`CREATIVE_PRODUCTION_ROOM_STAGE_ORDER_VIOLATION:${stageId}`);
  }

  const packet = object(evidence);
  const missing = requiredEvidenceKeys(stageId).filter((key) => {
    const value = packet[key];
    if (Array.isArray(value)) return value.length === 0;
    if (value && typeof value === "object") return Object.keys(value).length === 0;
    return !text(value);
  });
  if (missing.length) {
    throw new Error(`CREATIVE_PRODUCTION_ROOM_EVIDENCE_REQUIRED:${stageId}:${missing.join(",")}`);
  }
  assertStageWorkstreamReports(stageId, packet);
  assertSpecializedRoomReport(stageId, packet);

  const sealedDigest = digest({
    contract: CREATIVE_PRODUCTION_ROOM_CONTRACT,
    stage_id: stageId,
    previous_stage_digest: expectedPrevious,
    evidence: packet,
  });
  const stages = list(plan.stages).map((item) => {
    if (item.id === stageId) return Object.freeze({ ...item, status: "SEALED", evidence: packet, sealed_digest: sealedDigest });
    if (item.order === stage.order + 1) return Object.freeze({ ...item, status: "READY" });
    return item;
  });
  return Object.freeze({ ...plan, stages, zero_media_generation: true });
}export function evaluateProductionRoomReadiness(plan = {}) {
  if (plan.contract !== CREATIVE_PRODUCTION_ROOM_CONTRACT) {
    return Object.freeze({ passed: false, failures: ["CREATIVE_PRODUCTION_ROOM_PLAN_REQUIRED"] });
  }
  const stages = list(plan.stages);
  const failures = [];
  for (const stage of CREATIVE_PRODUCTION_ROOM_STAGES) {
    const actual = stages.find((item) => item.id === stage.id);
    if (!actual) failures.push(`CREATIVE_PRODUCTION_ROOM_STAGE_MISSING:${stage.id}`);
  }
  const sealed = stages.filter((stage) => stage.status === "SEALED");
  for (let index = 1; index < sealed.length; index += 1) {
    if (sealed[index].order !== sealed[index - 1].order + 1) {
      failures.push(`CREATIVE_PRODUCTION_ROOM_NON_CONTIGUOUS_SEAL:${sealed[index].id}`);
    }
  }
  return Object.freeze({
    passed: failures.length === 0,
    failures,
    sealed_stage_count: sealed.length,
    total_stage_count: CREATIVE_PRODUCTION_ROOM_STAGES.length,
  });
}

export function productionEntryGate(plan = {}) {
  const rehearsal = list(plan.stages).find((stage) => stage.id === PREPRODUCTION_GATE_STAGE);
  const production = list(plan.stages).find((stage) => stage.id === PRODUCTION_ENTRY_STAGE);
  const passed = rehearsal?.status === "SEALED" && ["READY", "SEALED"].includes(production?.status);
  return Object.freeze({
    passed,
    required_stage: PREPRODUCTION_GATE_STAGE,
    next_stage: PRODUCTION_ENTRY_STAGE,
    rehearsal_digest: rehearsal?.sealed_digest || null,
    zero_media_generation_before_gate: true,
  });
}

export const CreativeProductionRoomRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_ROOM_CONTRACT,
  createPlan: createProductionRoomPlan,
  sealStage: sealProductionRoomStage,
  sealTrustedUpstreamStage: sealTrustedUpstreamProductionRoomStage,
  evaluate: evaluateProductionRoomReadiness,
  productionEntryGate,
});