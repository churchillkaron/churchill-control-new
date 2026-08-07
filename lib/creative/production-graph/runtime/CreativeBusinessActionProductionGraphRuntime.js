import {
  ProductionGraphRuntime,
  ProductionGraphPlanningRuntime,
} from "./ProductionGraphRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.business-action-production-graph.v2",
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
  const narrative = object(plan.commercial_narrative);
  const bridge = object(plan.commercial_narrative_cinematic_bridge);
  const scenes = new Map();
  const shots = new Map();
  const narrativeScenes = new Map();
  const narrativeShots = new Map();
  for (const scene of list(assignment.scene_assignments)) {
    scenes.set(text(scene.scene_id), scene);
    for (const shot of list(scene.shot_assignments)) {
      shots.set(text(shot.shot_id), shot);
    }
  }
  for (const scene of list(narrative.scene_arcs)) {
    narrativeScenes.set(text(scene.scene_id), scene);
    for (const shot of list(scene.shot_arcs)) {
      narrativeShots.set(text(shot.shot_id), shot);
    }
  }
  return {
    intelligence: object(plan.business_action_intelligence),
    assignment,
    narrative,
    bridge,
    scenes,
    shots,
    narrativeScenes,
    narrativeShots,
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
  if (!text(maps.narrative.narrative_hash)) {
    throw new Error("BUSINESS_ACTION_GRAPH_COMMERCIAL_NARRATIVE_REQUIRED");
  }
  if (!text(maps.bridge.bridge_hash)) {
    throw new Error("BUSINESS_ACTION_GRAPH_CINEMATIC_BRIDGE_REQUIRED");
  }

  const nodes = list(graph.nodes).map((node) => {
    const type = text(node.type).toUpperCase();
    if (type === "SCENE") {
      const assignment = maps.scenes.get(text(node.id));
      const narrative = maps.narrativeScenes.get(text(node.id));
      if (!assignment) {
        throw new Error(`BUSINESS_ACTION_GRAPH_SCENE_ASSIGNMENT_REQUIRED:${node.id}`);
      }
      if (!narrative) {
        throw new Error(`BUSINESS_ACTION_GRAPH_SCENE_NARRATIVE_REQUIRED:${node.id}`);
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
          narrative_role: narrative.primary_role || null,
          narrative_job: narrative.narrative_job || "",
          audience_state_before: narrative.audience_state_before || "",
          audience_state_after: narrative.audience_state_after || "",
          tension_or_question: narrative.tension_or_question || "",
          action_payoff: narrative.action_payoff || "",
          proof_payoff: narrative.proof_payoff || "",
          emotional_turn: narrative.emotional_turn || "",
        },
        requirements: {
          ...object(node.requirements),
          business_action_intelligence_hash: maps.intelligence.intelligence_hash,
          business_action_assignment_hash: maps.assignment.assignment_hash,
          commercial_narrative_hash: maps.narrative.narrative_hash,
          commercial_narrative_cinematic_bridge_hash: maps.bridge.bridge_hash,
          attention_beat_ids: assignment.attention_beat_ids || [],
          communication_job: narrative.communication_job || "",
          sound_story_job: narrative.sound_story_job || "",
          causal_link_from_previous: narrative.causal_link_from_previous || "",
          causal_link_to_next: narrative.causal_link_to_next || "",
        },
        metadata: {
          ...object(node.metadata),
          business_action_scene_assignment: assignment,
          commercial_narrative: narrative,
          business_action_intelligence_hash: maps.intelligence.intelligence_hash,
          business_action_assignment_hash: maps.assignment.assignment_hash,
          commercial_narrative_hash: maps.narrative.narrative_hash,
          commercial_narrative_cinematic_bridge_hash: maps.bridge.bridge_hash,
        },
      };
    }

    if (type === "SHOT") {
      const assignment = maps.shots.get(text(node.id));
      const narrative = maps.narrativeShots.get(text(node.id));
      if (!assignment) {
        throw new Error(`BUSINESS_ACTION_GRAPH_SHOT_ASSIGNMENT_REQUIRED:${node.id}`);
      }
      if (!narrative) {
        throw new Error(`BUSINESS_ACTION_GRAPH_SHOT_NARRATIVE_REQUIRED:${node.id}`);
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
          narrative_function: narrative.narrative_function || "",
          narrative_event: narrative.event || "",
          narrative_cause: narrative.cause || "",
          narrative_consequence: narrative.consequence || "",
          narrative_audience_question: narrative.audience_question || "",
          narrative_audience_payoff: narrative.audience_payoff || "",
        },
        requirements: {
          ...object(node.requirements),
          business_action_intelligence_hash: maps.intelligence.intelligence_hash,
          business_action_assignment_hash: maps.assignment.assignment_hash,
          commercial_narrative_hash: maps.narrative.narrative_hash,
          commercial_narrative_cinematic_bridge_hash: maps.bridge.bridge_hash,
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
          narrative_function: narrative.narrative_function || "",
          narrative_event: narrative.event || "",
          narrative_cause: narrative.cause || "",
          narrative_consequence: narrative.consequence || "",
          narrative_action_requirement: narrative.action_requirement || "",
          narrative_proof_requirement: narrative.proof_requirement || "",
          narrative_communication_function: narrative.communication_function || "",
          narrative_sound_function: narrative.sound_function || "",
          narrative_open_loop_ids: narrative.opens_loop_ids || [],
          narrative_resolved_loop_ids: narrative.resolves_loop_ids || [],
        },
        metadata: {
          ...object(node.metadata),
          business_action: assignment,
          commercial_narrative: narrative,
          business_action_intelligence_hash: maps.intelligence.intelligence_hash,
          business_action_assignment_hash: maps.assignment.assignment_hash,
          commercial_narrative_hash: maps.narrative.narrative_hash,
          commercial_narrative_cinematic_bridge_hash: maps.bridge.bridge_hash,
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
      commercial_narrative: maps.narrative,
      commercial_narrative_cinematic_bridge: maps.bridge,
      business_action_intelligence_hash: maps.intelligence.intelligence_hash,
      business_action_assignment_hash: maps.assignment.assignment_hash,
      commercial_narrative_hash: maps.narrative.narrative_hash,
      commercial_narrative_cinematic_bridge_hash: maps.bridge.bridge_hash,
      communication_strategy: maps.intelligence.communication_strategy || {},
      sound_strategy: maps.intelligence.sound_strategy || {},
      shot_function_strategy: maps.intelligence.shot_function_strategy || {},
      attention_curve: maps.intelligence.attention_curve || [],
      proof_model: maps.intelligence.proof_model || {},
      narrative_curve: maps.narrative.narrative_curve || [],
      dramatic_question: maps.narrative.dramatic_question || "",
      commercial_promise: maps.narrative.commercial_promise || "",
      cta_strategy: maps.narrative.cta_strategy || {},
      business_action_graph_contract: "CREATIVE_BUSINESS_ACTION_PRODUCTION_GRAPH_V2",
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
  contract: "CREATIVE_BUSINESS_ACTION_PRODUCTION_GRAPH_V2",
  enrich: enrichGraph,
});
