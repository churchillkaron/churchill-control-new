import {
  createProductionRoomPlan,
  sealTrustedUpstreamProductionRoomStage,
} from "./CreativeProductionRoomRuntime.js";
import { buildResearchRoomReport } from "./CreativeResearchRoomAdapterRuntime.js";
import { buildShotPrevisualizationBlueprint } from "../../quality/runtime/CreativeShotPrevisualizationBlueprintRuntime.js";
import { evaluateTechnicalScout } from "./CreativeTechnicalScoutRuntime.js";
import { buildDepartmentBreakdown } from "./CreativeDepartmentBreakdownRuntime.js";
import {
  evaluateCreativeFloor,
  evaluateConceptCompetition,
} from "./CreativeFrontProductionRoomsRuntime.js";
import { evaluateProductionOffice } from "./CreativeProductionOfficeRuntime.js";
import { createCurrentRoomWorkOrders } from "./CreativeProductionWorkOrderRuntime.js";
import { continuePreproductionWithoutSpend } from "./CreativePreproductionContinuationRuntime.js";
import { durablePipelineCompatible } from "./CreativeProductionRoomDurableReconciliationRuntime.js";

export const CREATIVE_PRODUCTION_ROOM_BOOTSTRAP_CONTRACT =
  "CREATIVE_PRODUCTION_ROOM_BOOTSTRAP_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text(value) {
  return String(value ?? "").trim();
}
function flattenShots(plan = {}) {
  return list(plan.scenes).flatMap((scene) =>
    list(scene.shots).map((shot) => ({ ...shot, scene_id: shot.scene_id || scene.id })),
  );
}
function councilArtifact(master = {}, plan = {}) {
  const council = master.independent_concept_council || plan.independent_concept_council || {};
  const concepts = list(council.concepts).length
    ? list(council.concepts)
    : list(plan.concept_candidates);
  const selectedConcept =
    council.selection?.selected_concept ||
    (text(council.selected_concept_id)
      ? concepts.find((concept) => text(concept?.id || concept?.concept_id) === text(council.selected_concept_id)) || {
          id: text(council.selected_concept_id),
        }
      : null);
  const criticReports = list(council.critic_reports).length
    ? list(council.critic_reports)
    : list(council.critic_scorecards);
  const isCurrentContract = council.contract === "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1";
  const isSealedCanonicalCouncil =
    text(council.council_hash) &&
    Number(council.director_count || 0) >= 3 &&
    concepts.length >= 3 &&
    criticReports.length >= 5 &&
    council.distinctness?.passed === true &&
    council.world_class_gate?.passed === true &&
    text(selectedConcept?.id);
  if (!isCurrentContract && !isSealedCanonicalCouncil) return null;
  return Object.freeze({
    ...council,
    contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
    concepts,
    critic_reports: criticReports,
    selection: {
      ...(council.selection || {}),
      selected_concept: selectedConcept,
    },
  });
}
function researchBenchmarkLab(research = {}) {
  const metadata = object(research.metadata);
  const grounding = object(research.creative_grounding || metadata.creative_grounding);
  return object(grounding.benchmark_lab || metadata.benchmark_lab || research.benchmark_lab);
}
function researchReferenceStrategy(research = {}, researchReport = {}) {
  const metadata = object(research.metadata);
  const grounding = object(
    research.creative_grounding ||
    metadata.creative_grounding,
  );
  const references = list(researchReport.reference_candidates).length
    ? list(researchReport.reference_candidates)
    : list(grounding.reference_candidates);
  if (!references.length) return {};
  return Object.freeze({
    contract: "CREATIVE_RESEARCH_GROUNDED_REFERENCE_STRATEGY_V1",
    authority: "EVIDENCE_ONLY",
    references,
    continuity_constraints: list(grounding.continuity_constraints),
  });
}
export function bootstrapProductionRooms({ project = {}, brief = {}, research = {}, universal_asset_intelligence = {}, master = {}, durable_state = null } = {}) {
  const plan = master.plan || {};
  const roomPlan = createProductionRoomPlan({
    project_id: project.id || null,
    master_plan_digest: plan.story_lineage?.master_plan_hash || plan.metadata?.story_lineage?.master_plan_hash || null,
  });
  const researchReport = buildResearchRoomReport({
    research,
    universal_asset_intelligence,
    brief,
  });
  const council = councilArtifact(master, plan);
  const creativeFloor = evaluateCreativeFloor({
    plan,
    reference_strategy:
      plan.reference_strategy ||
      plan.cinematic_reference_strategy ||
      plan.production?.reference_strategy ||
      researchReferenceStrategy(research, researchReport),
    benchmark_lab:
      plan.benchmark_lab ||
      plan.production?.benchmark_lab ||
      researchBenchmarkLab(research),
    taste_learning:
      plan.taste_learning ||
      brief.metadata?.creative_learning ||
      {},
  });
  const conceptCompetition = evaluateConceptCompetition({ council: council || {} });
  const shots = flattenShots(plan);
  const previs = shots.map((shot) => ({
    shot_id: shot.id || null,
    report: buildShotPrevisualizationBlueprint(shot),
  }));
  const technicalScout = shots.length
    ? evaluateTechnicalScout({
        shots,
        production_design_bible: plan.production_design_bible || plan.production?.production_design_bible || {},
        lighting_simulation: plan.lighting_simulation || plan.production?.lighting_simulation || {},
        material_physics: plan.material_physics || plan.production?.material_physics || {},
      })
    : null;
  const departmentBreakdown = shots.length
    ? buildDepartmentBreakdown({
        shots,
        take_strategy: plan.take_strategy || plan.production?.take_strategy || {},
        role_decisions: plan.role_decisions || plan.agency_decisions || {},
      })
    : null;
  const upstreamHandoffs = [
    ["RESEARCH_ROOM", researchReport],
    ["CREATIVE_FLOOR", creativeFloor],
    ["CONCEPT_COMPETITION", conceptCompetition],
    ["TRIBUNAL", master.creative_tribunal || plan.creative_tribunal || null],
  ];
  let seededRoomPlan = roomPlan;
  let previousUpstreamDigest = null;
  let upstreamHandoffFailure = null;
  for (const [stageId, report] of upstreamHandoffs) {
    try {
      seededRoomPlan = sealTrustedUpstreamProductionRoomStage({
        plan: seededRoomPlan,
        stage_id: stageId,
        report,
        previous_stage_digest: previousUpstreamDigest,
      });
      previousUpstreamDigest = seededRoomPlan.stages.find((stage) => stage.id === stageId)?.sealed_digest || null;
    } catch (error) {
      upstreamHandoffFailure = { stage_id: stageId, error: String(error?.message || error) };
      break;
    }
  }

  const stage_inputs = {
    RESEARCH_ROOM: {
      research_room_report: researchReport,
      supplied_workstream_reports: researchReport.workstream_report ? [researchReport.workstream_report] : [],
    },
    CREATIVE_FLOOR: {
      concept: plan.concept || {},
      story: plan.story || {},
      creative_learning: brief.metadata?.creative_learning || null,
      room_report: creativeFloor,
      benchmark_lab: creativeFloor.benchmark_lab || null,
    },
    CONCEPT_COMPETITION: {
      council,
      passed: conceptCompetition.passed === true,
      room_report: conceptCompetition,
    },
    TRIBUNAL: {
      report: master.creative_tribunal || plan.creative_tribunal || null,
    },
    TECHNICAL_SCOUT: {
      report: technicalScout,
    },
    PREVIS: {
      shot_reports: previs,
      passed: previs.length > 0 && previs.every((item) => item.report.passed === true),
    },
    DEPARTMENT_BREAKDOWN: {
      report: departmentBreakdown,
      units: departmentBreakdown?.units || [],
      shot_assignments: departmentBreakdown?.shot_assignments || [],
    },
    PRODUCTION_UNITS: {
      planned_units: departmentBreakdown?.units || [],
      take_strategy: departmentBreakdown?.take_strategy || null,
    },
  };

  const durablePipeline = durablePipelineCompatible(
    durable_state?.production_room_pipeline || {},
    seededRoomPlan,
  )
    ? durable_state.production_room_pipeline
    : null;
  const activeRoomPlan = durablePipeline || seededRoomPlan;
  const generatedReports = Object.fromEntries(
    activeRoomPlan.stages.map((stage) => [stage.id, list(stage_inputs[stage.id]?.supplied_workstream_reports)]),
  );
  const reportsByStage = Object.fromEntries(
    activeRoomPlan.stages.map((stage) => [
      stage.id,
      list(durable_state?.reports_by_stage?.[stage.id]).length
        ? list(durable_state.reports_by_stage[stage.id])
        : generatedReports[stage.id],
    ]),
  );
  const productionOffice = evaluateProductionOffice({
    plan: activeRoomPlan,
    reports_by_stage: reportsByStage,
  });
  const productionWorkOrders = createCurrentRoomWorkOrders({
    office: productionOffice,
    reports_by_stage: reportsByStage,
  });
  const preproductionContinuation = continuePreproductionWithoutSpend({
    production_room_pipeline: activeRoomPlan,
    production_room_stage_inputs: stage_inputs,
    reports_by_stage: reportsByStage,
  });
  const readiness = activeRoomPlan.stages.map((stage) => {
    const supplied = list(stage_inputs[stage.id]?.supplied_workstream_reports).map((report) => Number(report.requirement));
    const missing = list(stage.required_workstream_requirements).filter((requirement) => !supplied.includes(Number(requirement)));
    return { stage_id: stage.id, status: stage.status, missing_workstream_requirements: missing };
  });
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_ROOM_BOOTSTRAP_CONTRACT,
    production_room_pipeline: preproductionContinuation.production_room_pipeline || activeRoomPlan,
    stage_inputs,
    reports_by_stage: reportsByStage,
    readiness,
    research_room_passed: researchReport.passed === true,
    creative_floor_passed: creativeFloor.passed === true,
    concept_competition_present: Boolean(council),
    concept_competition_passed: conceptCompetition.passed === true,
    technical_scout_passed: technicalScout?.passed === true,
    previs_passed: previs.length > 0 && previs.every((item) => item.report.passed === true),
    department_breakdown_passed: departmentBreakdown?.passed === true,
    planned_production_unit_count: departmentBreakdown?.units?.length || 0,
    production_office: productionOffice,
    production_work_orders: productionWorkOrders,
    current_room: productionOffice.current_room || null,
    preproduction_continuation: preproductionContinuation,
    upstream_handoff_failure: upstreamHandoffFailure,
    production_blockers: productionOffice.blockers || [],
    ready_work_order_count: productionWorkOrders.ready_count || 0,
    blocked_work_order_count: productionWorkOrders.blocked_count || 0,
    zero_media_generation: true,
  });
}

export const CreativeProductionRoomBootstrapRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_ROOM_BOOTSTRAP_CONTRACT,
  bootstrap: bootstrapProductionRooms,
});