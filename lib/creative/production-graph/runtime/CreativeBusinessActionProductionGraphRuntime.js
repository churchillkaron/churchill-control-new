import {
  ProductionGraphRuntime,
  ProductionGraphPlanningRuntime,
} from "./ProductionGraphRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.business-action-production-graph.v1",
);

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

function assignmentMaps(plan = {}) {
  const assignment = object(plan.business_action_assignment);
  const scenes = new Map();
  const shots = new Map();
  for (const scene of list(assignment.scene_assignments)) {
    scenes.set(text(scene.scene_id), scene);
    for (const shot of list(scene.shot_assignments)) {
      shots.set(text(shot.shot_id), shot);
    }
  }
  return {
    intelligence: object(plan.business_action_intelligence),
    assignment,
    scenes,
    shots,
  };
}

function enrichGraph(graph = {}, plan = {}) {
  const maps = assignmentMaps(plan);
  if (
    !text(maps.intelligence.intelligence_hash) ||
    !text(maps.assignment.assignment_hash)
  ) {
    throw new Error("BUSINESS_ACTION_GRAPH_INTELLIGENCE_REQUIRED");
  }

  const nodes = list(graph.nodes).map((node) => {
    const type = text(node.type).toUpperCase();
    if (type === "SCENE") {
      const assignment = maps.scenes.get(text(node.id));
      if (!assignment) {
        throw new Error(`BUSINESS_ACTION_GRAPH_SCENE_ASSIGNMENT_REQUIRED:${node.id}`);
      }
      return {
        ...node,
        intent: {
          ...object(node.intent),
          commercial_job: assignment.commercial_job || "",
          action_escalation_job: assignment.action_escalation_job || "",
          proof_job: assignment.proof_job || "",
          human_ecosystem_job: assignment.human_ecosystem_job || "",
          environment_job: assignment.environment_job || "",
          communication_job: assignment.communication_job || "",
          sound_job: assignment.sound_job || "",
        },
        requirements: {
          ...object(node.requirements),
          business_action_intelligence_hash: maps.intelligence.intelligence_hash,
          business_action_assignment_hash: maps.assignment.assignment_hash,
          attention_beat_ids: assignment.attention_beat_ids || [],
        },
        metadata: {
          ...object(node.metadata),
          business_action_scene_assignment: assignment,
          business_action_intelligence_hash: maps.intelligence.intelligence_hash,
          business_action_assignment_hash: maps.assignment.assignment_hash,
        },
      };
    }

    if (type === "SHOT") {
      const assignment = maps.shots.get(text(node.id));
      if (!assignment) {
        throw new Error(`BUSINESS_ACTION_GRAPH_SHOT_ASSIGNMENT_REQUIRED:${node.id}`);
      }
      return {
        ...node,
        intent: {
          ...object(node.intent),
          shot_function: assignment.primary_function || null,
          secondary_functions: assignment.secondary_functions || [],
          visible_change_required: assignment.visible_change_required || "",
          interaction_required: assignment.interaction_required || "",
          novelty_from_previous_shot: assignment.novelty_from_previous_shot || "",
          audience_question_opened: assignment.audience_question_opened || "",
          audience_payoff: assignment.audience_payoff || "",
        },
        requirements: {
          ...object(node.requirements),
          business_action_intelligence_hash: maps.intelligence.intelligence_hash,
          business_action_assignment_hash: maps.assignment.assignment_hash,
          shot_function: assignment.primary_function || null,
          secondary_functions: assignment.secondary_functions || [],
          attention_beat_id: assignment.attention_beat_id || null,
          action_ids: assignment.action_ids || [],
          proof_ids: assignment.proof_ids || [],
          human_roles: assignment.human_roles || [],
          visible_change_required: assignment.visible_change_required || "",
          interaction_required: assignment.interaction_required || "",
          foreground_job: assignment.foreground_job || "",
          midground_job: assignment.midground_job || "",
          background_job: assignment.background_job || "",
          communication_strategy: object(assignment.communication),
          sound_strategy: object(assignment.sound),
          novelty_from_previous_shot: assignment.novelty_from_previous_shot || "",
          audience_question_opened: assignment.audience_question_opened || "",
          audience_payoff: assignment.audience_payoff || "",
        },
        metadata: {
          ...object(node.metadata),
          business_action: assignment,
          business_action_intelligence_hash: maps.intelligence.intelligence_hash,
          business_action_assignment_hash: maps.assignment.assignment_hash,
          provider_prompts_persisted: false,
        },
      };
    }

    return node;
  });

  return {
    ...graph,
    nodes,
    metadata: {
      ...object(graph.metadata),
      business_action_intelligence: maps.intelligence,
      business_action_assignment: maps.assignment,
      business_action_intelligence_hash: maps.intelligence.intelligence_hash,
      business_action_assignment_hash: maps.assignment.assignment_hash,
      communication_strategy: maps.intelligence.communication_strategy || {},
      sound_strategy: maps.intelligence.sound_strategy || {},
      shot_function_strategy: maps.intelligence.shot_function_strategy || {},
      attention_curve: maps.intelligence.attention_curve || [],
      proof_model: maps.intelligence.proof_model || {},
      business_action_graph_contract: "CREATIVE_BUSINESS_ACTION_PRODUCTION_GRAPH_V1",
      provider_prompts_persisted: false,
    },
  };
}

function install() {
  if (ProductionGraphRuntime[INSTALL_FLAG]) return;
  Object.defineProperty(ProductionGraphRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.preview = async function previewWithBusinessAction(input = {}) {
    const planned = await ProductionGraphPlanningRuntime.build(input);
    return enrichGraph(planned, input.creative_plan);
  };

  ProductionGraphRuntime.plan = async function planWithBusinessAction(input = {}) {
    const planned = await ProductionGraphPlanningRuntime.build(input);
    const enriched = enrichGraph(planned, input.creative_plan);
    return ProductionGraphRuntime.create(enriched);
  };
}

install();

export const CreativeBusinessActionProductionGraphRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_BUSINESS_ACTION_PRODUCTION_GRAPH_V1",
  enrich: enrichGraph,
});
