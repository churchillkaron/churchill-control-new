import "./CreativeConceptCouncilRuntime";
import "./CreativeBusinessActionCoverageRuntime";
import "./CreativeCinematicImpactRuntime";

import {
  CreativeMasterPlanRuntime,
} from "@/lib/creative/director/runtime/CreativeMasterPlanRuntime";
import {
  CreativeMeasuredUniversalTemporalDirectionRuntime,
} from "@/lib/creative/director/runtime/CreativeMeasuredUniversalTemporalDirectionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.universal-temporal-coverage.v1",
);
const RESEARCH_GATE_FLAG = Symbol.for(
  "avantiqo.creative.research.master-plan-gate.v6",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim().toUpperCase();
}

function temporalProject(project = {}, brief = {}) {
  const metadata = object(project.metadata);
  const workflow = text(
    metadata.workflow_kind ||
    metadata.creative_medium ||
    project.production_type ||
    brief.workflow_kind ||
    brief.creative_medium,
  );
  return ["TEMPORAL", "VIDEO", "FILM", "ANIMATION"].includes(workflow);
}

function universalPlan(result = {}) {
  const plan = object(result.plan);
  return plan.workflow_kind === "TEMPORAL" &&
    Array.isArray(plan.concept_candidates) &&
    plan.concept_candidates.length >= 3 &&
    Boolean(plan.selected_concept_id) &&
    Boolean(plan.concept_council?.council_hash) &&
    plan.business_action_intelligence?.contract ===
      "CREATIVE_BUSINESS_ACTION_INTELLIGENCE_V2" &&
    Boolean(plan.business_action_intelligence?.intelligence_hash) &&
    plan.business_action_assignment?.contract ===
      "CREATIVE_BUSINESS_ACTION_ASSIGNMENT_V1" &&
    Boolean(plan.business_action_assignment?.assignment_hash) &&
    plan.cinematic_impact_contract?.contract ===
      "CREATIVE_CINEMATIC_IMPACT_DIRECTION_V2" &&
    plan.cinematic_impact_review?.world_class_release_gate_passed === true &&
    plan.validation_summary?.cinematic_impact?.passed === true &&
    plan.validation_summary?.cinematic_impact_semantic_review?.passed === true;
}

function enrichedBrief(input = {}, research = {}) {
  const brief = object(input.brief);
  if (!research?.id) return brief;
  return {
    ...brief,
    metadata: {
      ...object(brief.metadata),
      autonomous_research:
        brief.metadata?.autonomous_research ||
        research.metadata?.autonomous_research ||
        research,
    },
  };
}

function install() {
  if (CreativeMasterPlanRuntime[INSTALL_FLAG]) return;
  const researchGateAlreadyInstalled =
    CreativeMasterPlanRuntime[RESEARCH_GATE_FLAG] === true;
  const createWithoutCoverage = CreativeMasterPlanRuntime.create.bind(
    CreativeMasterPlanRuntime,
  );
  Object.defineProperty(CreativeMasterPlanRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanRuntime.create = async function createWithUniversalTemporalCoverage(input = {}) {
    const project = object(input.project);
    const brief = object(input.brief);
    if (!temporalProject(project, brief)) {
      return createWithoutCoverage(input);
    }

    if (!researchGateAlreadyInstalled) {
      return CreativeMeasuredUniversalTemporalDirectionRuntime.create(input);
    }

    const researchBacked = await createWithoutCoverage(input);
    if (universalPlan(researchBacked)) return researchBacked;

    const directed = await CreativeMeasuredUniversalTemporalDirectionRuntime.create({
      ...input,
      brief: enrichedBrief(input, researchBacked.research),
    });
    return {
      ...directed,
      research: researchBacked.research || directed.research || null,
      research_validation:
        researchBacked.research_validation ||
        directed.research_validation ||
        null,
      temporal_coverage_recovery: {
        contract: "UNIVERSAL_TEMPORAL_COVERAGE_RECOVERY_V2",
        reason: "CURRENT_BUSINESS_ACTION_AND_CINEMATIC_CONTRACTS_REQUIRED",
      },
    };
  };
}

install();

export const CreativeUniversalTemporalCoverageBootstrap = {
  installed: true,
  temporalProject,
};
