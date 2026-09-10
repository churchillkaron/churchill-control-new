import { createProductionRoomPlan } from "./CreativeProductionRoomRuntime.js";
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

export const CREATIVE_PRODUCTION_ROOM_BOOTSTRAP_CONTRACT =
  "CREATIVE_PRODUCTION_ROOM_BOOTSTRAP_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
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
  return council.contract === "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1" ? council : null;
}
export function bootstrapProductionRooms({ project = {}, brief = {}, research = {}, universal_asset_intelligence = {}, master = {} } = {}) {
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
      {},
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
    },
    CONCEPT_COMPETITION: {
      council,
      passed: conceptCompetition.passed === true,
      room_report: conceptCompetition,
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

  const reportsByStage = Object.fromEntries(
    roomPlan.stages.map((stage) => [stage.id, list(stage_inputs[stage.id]?.supplied_workstream_reports)]),
  );
  const productionOffice = evaluateProductionOffice({
    plan: roomPlan,
    reports_by_stage: reportsByStage,
  });
  const productionWorkOrders = createCurrentRoomWorkOrders({
    office: productionOffice,
    reports_by_stage: reportsByStage,
  });
  const readiness = roomPlan.stages.map((stage) => {
    const supplied = list(stage_inputs[stage.id]?.supplied_workstream_reports).map((report) => Number(report.requirement));
    const missing = list(stage.required_workstream_requirements).filter((requirement) => !supplied.includes(Number(requirement)));
    return { stage_id: stage.id, status: stage.status, missing_workstream_requirements: missing };
  });
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_ROOM_BOOTSTRAP_CONTRACT,
    production_room_pipeline: roomPlan,
    stage_inputs,
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
