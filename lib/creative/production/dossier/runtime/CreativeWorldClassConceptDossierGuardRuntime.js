import {
  CreativeProductionDossierRuntime,
} from "./CreativeProductionDossierRuntime";
import {
  WORLD_CLASS_CONCEPT_POLICY,
} from "@/lib/creative/director/runtime/CreativeWorldClassConceptIntelligenceRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.world-class-concept.dossier-guard.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function assertWorldClassConcept(productionGraph = {}) {
  const plan = object(productionGraph.metadata?.approval_plan_snapshot);
  const gate = object(plan.world_class_concept_intelligence);

  if (gate.contract !== WORLD_CLASS_CONCEPT_POLICY.contract) {
    throw new Error("PRODUCTION_DOSSIER_WORLD_CLASS_CONCEPT_CONTRACT_REQUIRED");
  }
  if (gate.passed !== true || gate.b_grade_concept_forbidden !== true) {
    throw new Error("PRODUCTION_DOSSIER_WORLD_CLASS_CONCEPT_GATE_REQUIRED");
  }

  const temporal = text(plan.workflow_kind).toUpperCase() === "TEMPORAL";
  if (temporal) {
    const council = object(gate.council);
    if (
      gate.temporal_council_enforced !== true ||
      council.passed !== true ||
      !text(council.selected_concept_id)
    ) {
      throw new Error("PRODUCTION_DOSSIER_A_GRADE_CONCEPT_COUNCIL_REQUIRED");
    }
    if (Number(council.weighted_score) < WORLD_CLASS_CONCEPT_POLICY.minimum_weighted_score) {
      throw new Error("PRODUCTION_DOSSIER_CONCEPT_SCORE_BELOW_A_GRADE");
    }
    if (Number(council.selector_confidence) < WORLD_CLASS_CONCEPT_POLICY.minimum_selector_confidence) {
      throw new Error("PRODUCTION_DOSSIER_CONCEPT_CONFIDENCE_BELOW_A_GRADE");
    }
  }

  return gate;
}

export function installCreativeWorldClassConceptDossierGuardRuntime() {
  if (CreativeProductionDossierRuntime[INSTALL_FLAG]) return;

  const materialize = CreativeProductionDossierRuntime.materialize.bind(
    CreativeProductionDossierRuntime,
  );

  Object.defineProperty(CreativeProductionDossierRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeProductionDossierRuntime.materialize = async function materializeWithConceptGate(input = {}) {
    assertWorldClassConcept(input.production_graph);
    return materialize(input);
  };
}

installCreativeWorldClassConceptDossierGuardRuntime();

export const CreativeWorldClassConceptDossierGuardRuntime = Object.freeze({
  installed: true,
  contract: "AVANTIQO_WORLD_CLASS_CONCEPT_DOSSIER_GUARD_V1",
  assertWorldClassConcept,
});
