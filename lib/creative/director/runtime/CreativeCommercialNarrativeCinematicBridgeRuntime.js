import crypto from "node:crypto";

import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.commercial-narrative-cinematic-bridge.v1",
);
const CONTRACT = "CREATIVE_COMMERCIAL_NARRATIVE_CINEMATIC_BRIDGE_V1";

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

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function narrativeMaps(narrative = {}) {
  const scenes = new Map();
  const shots = new Map();
  for (const scene of list(narrative.scene_arcs)) {
    scenes.set(text(scene.scene_id), scene);
    for (const shot of list(scene.shot_arcs)) {
      shots.set(text(shot.shot_id), shot);
    }
  }
  return { scenes, shots };
}

function bindPlan(plan = {}) {
  const intelligence = object(plan.business_action_intelligence);
  const assignment = object(plan.business_action_assignment);
  const narrative = object(plan.commercial_narrative);

  if (!text(intelligence.intelligence_hash)) {
    throw new Error("COMMERCIAL_NARRATIVE_BRIDGE_INTELLIGENCE_REQUIRED");
  }
  if (!text(assignment.assignment_hash)) {
    throw new Error("COMMERCIAL_NARRATIVE_BRIDGE_ASSIGNMENT_REQUIRED");
  }
  if (!text(narrative.narrative_hash)) {
    throw new Error("COMMERCIAL_NARRATIVE_BRIDGE_NARRATIVE_REQUIRED");
  }
  if (
    text(narrative.business_action_intelligence_hash) !==
    text(intelligence.intelligence_hash)
  ) {
    throw new Error("COMMERCIAL_NARRATIVE_BRIDGE_INTELLIGENCE_HASH_MISMATCH");
  }
  if (
    text(narrative.business_action_assignment_hash) !==
    text(assignment.assignment_hash)
  ) {
    throw new Error("COMMERCIAL_NARRATIVE_BRIDGE_ASSIGNMENT_HASH_MISMATCH");
  }

  const maps = narrativeMaps(narrative);
  const scenes = list(plan.scenes).map((scene) => {
    const sceneArc = maps.scenes.get(text(scene.id));
    if (!sceneArc) {
      throw new Error(`COMMERCIAL_NARRATIVE_BRIDGE_SCENE_REQUIRED:${scene.id}`);
    }
    const shots = list(scene.shots).map((shot) => {
      const shotArc = maps.shots.get(text(shot.id));
      if (!shotArc) {
        throw new Error(`COMMERCIAL_NARRATIVE_BRIDGE_SHOT_REQUIRED:${shot.id}`);
      }
      const businessAction = object(shot.metadata?.business_action);
      const mandate = {
        contract: CONTRACT,
        commercial_narrative_hash: narrative.narrative_hash,
        scene_primary_role: sceneArc.primary_role || null,
        scene_narrative_job: sceneArc.narrative_job || "",
        scene_audience_state_before: sceneArc.audience_state_before || "",
        scene_audience_state_after: sceneArc.audience_state_after || "",
        scene_tension_or_question: sceneArc.tension_or_question || "",
        scene_action_payoff: sceneArc.action_payoff || "",
        scene_proof_payoff: sceneArc.proof_payoff || "",
        scene_emotional_turn: sceneArc.emotional_turn || "",
        narrative_function: shotArc.narrative_function || "",
        event: shotArc.event || "",
        cause: shotArc.cause || "",
        consequence: shotArc.consequence || "",
        audience_question: shotArc.audience_question || "",
        audience_payoff: shotArc.audience_payoff || "",
        action_requirement: shotArc.action_requirement || "",
        proof_requirement: shotArc.proof_requirement || "",
        communication_function: shotArc.communication_function || "",
        sound_function: shotArc.sound_function || "",
        opens_loop_ids: shotArc.opens_loop_ids || [],
        resolves_loop_ids: shotArc.resolves_loop_ids || [],
        assigned_shot_function: businessAction.primary_function || null,
        assigned_action_ids: businessAction.action_ids || [],
        assigned_proof_ids: businessAction.proof_ids || [],
        assigned_human_roles: businessAction.human_roles || [],
        assigned_visible_change: businessAction.visible_change_required || "",
        assigned_communication: object(businessAction.communication),
        assigned_sound: object(businessAction.sound),
        immutable_story_job: true,
      };
      return {
        ...shot,
        metadata: {
          ...object(shot.metadata),
          cinematic_mandate: mandate,
          commercial_narrative_hash: narrative.narrative_hash,
        },
      };
    });
    return {
      ...scene,
      shots,
      metadata: {
        ...object(scene.metadata),
        commercial_narrative_hash: narrative.narrative_hash,
        cinematic_mandate: {
          contract: CONTRACT,
          commercial_narrative_hash: narrative.narrative_hash,
          primary_role: sceneArc.primary_role || null,
          secondary_roles: sceneArc.secondary_roles || [],
          narrative_job: sceneArc.narrative_job || "",
          audience_state_before: sceneArc.audience_state_before || "",
          audience_state_after: sceneArc.audience_state_after || "",
          tension_or_question: sceneArc.tension_or_question || "",
          action_payoff: sceneArc.action_payoff || "",
          proof_payoff: sceneArc.proof_payoff || "",
          emotional_turn: sceneArc.emotional_turn || "",
          communication_job: sceneArc.communication_job || "",
          sound_story_job: sceneArc.sound_story_job || "",
          causal_link_from_previous: sceneArc.causal_link_from_previous || "",
          causal_link_to_next: sceneArc.causal_link_to_next || "",
          immutable_story_job: true,
        },
      },
    };
  });

  const bridgeCore = {
    contract: CONTRACT,
    business_action_intelligence_hash: intelligence.intelligence_hash,
    business_action_assignment_hash: assignment.assignment_hash,
    commercial_narrative_hash: narrative.narrative_hash,
    story_thesis: narrative.story_thesis || "",
    dramatic_question: narrative.dramatic_question || "",
    narrative_mode: narrative.narrative_mode || "",
    commercial_promise: narrative.commercial_promise || "",
    tension_engine: narrative.tension_engine || "",
    payoff_principle: narrative.payoff_principle || "",
    cta_strategy: narrative.cta_strategy || {},
    narrative_curve: narrative.narrative_curve || [],
    cinematic_direction_must_serve_narrative: true,
    camera_must_follow_event_and_blocking: true,
    sound_must_follow_story_pressure_and_payoff: true,
    communication_must_follow_story_job: true,
    immutable_story_jobs: true,
  };

  return {
    ...plan,
    scenes,
    commercial_narrative_cinematic_bridge: {
      ...bridgeCore,
      bridge_hash: digest(bridgeCore),
    },
    production: {
      ...object(plan.production),
      commercial_narrative_cinematic_bridge_required: true,
      cinematic_direction_must_serve_commercial_narrative: true,
      camera_before_blocking_forbidden: true,
      disconnected_wow_moment_release_blocked: true,
      disconnected_beauty_coverage_release_blocked: true,
    },
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;
  const createWithoutBridge =
    CreativeUniversalTemporalDirectionRuntime.create.bind(
      CreativeUniversalTemporalDirectionRuntime,
    );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    { value: true, enumerable: false, configurable: false },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithCommercialNarrativeBridge(input = {}) {
      const directed = await createWithoutBridge(input);
      if (!directed?.plan || directed.plan.workflow_kind !== "TEMPORAL") {
        return directed;
      }
      const plan = bindPlan(directed.plan);
      return {
        ...directed,
        plan,
        commercial_narrative_cinematic_bridge:
          plan.commercial_narrative_cinematic_bridge,
      };
    };
}

install();

export const CreativeCommercialNarrativeCinematicBridgeRuntime = Object.freeze({
  installed: true,
  contract: CONTRACT,
  bind: bindPlan,
});
