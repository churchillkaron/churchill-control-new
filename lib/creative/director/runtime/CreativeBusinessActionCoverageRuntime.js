import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";
import {
  CreativeBusinessActionIntelligenceRuntime,
} from "./CreativeBusinessActionIntelligenceRuntime";
import {
  CreativeBusinessActionAssignmentRuntime,
} from "./CreativeBusinessActionAssignmentRuntime";
import {
  CreativeCommercialNarrativeRuntime,
} from "./CreativeCommercialNarrativeRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.business-action-coverage.v2",
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

function assignmentIndex(assignment = {}) {
  const map = new Map();
  for (const scene of list(assignment.scene_assignments)) {
    for (const shot of list(scene.shot_assignments)) {
      map.set(text(shot.shot_id), {
        scene_assignment: scene,
        shot_assignment: shot,
      });
    }
  }
  return map;
}

function narrativeIndex(narrative = {}) {
  const sceneMap = new Map();
  const shotMap = new Map();
  for (const scene of list(narrative.scene_arcs)) {
    sceneMap.set(text(scene.scene_id), scene);
    for (const shot of list(scene.shot_arcs)) {
      shotMap.set(text(shot.shot_id), shot);
    }
  }
  return { sceneMap, shotMap };
}

function enrichPlan(
  plan = {},
  intelligence = {},
  assignment = {},
  narrative = {},
) {
  const index = assignmentIndex(assignment);
  const narrativeMaps = narrativeIndex(narrative);
  const scenes = list(plan.scenes).map((scene) => {
    const sceneAssignment = list(assignment.scene_assignments)
      .find((item) => text(item.scene_id) === text(scene.id)) || {};
    const sceneNarrative = narrativeMaps.sceneMap.get(text(scene.id)) || {};
    return {
      ...scene,
      metadata: {
        ...object(scene.metadata),
        business_action_intelligence_hash: intelligence.intelligence_hash,
        business_action_assignment_hash: assignment.assignment_hash,
        commercial_narrative_hash: narrative.narrative_hash,
        business_action_scene_assignment: {
          attention_beat_ids: sceneAssignment.attention_beat_ids || [],
          commercial_job: sceneAssignment.commercial_job || "",
          action_escalation_job: sceneAssignment.action_escalation_job || "",
          proof_job: sceneAssignment.proof_job || "",
          human_ecosystem_job: sceneAssignment.human_ecosystem_job || "",
          environment_job: sceneAssignment.environment_job || "",
          communication_job: sceneAssignment.communication_job || "",
          sound_job: sceneAssignment.sound_job || "",
        },
        commercial_narrative: sceneNarrative,
      },
      shots: list(scene.shots).map((shot) => {
        const mapped = index.get(text(shot.id));
        const shotAssignment = mapped?.shot_assignment || {};
        const shotNarrative = narrativeMaps.shotMap.get(text(shot.id)) || {};
        return {
          ...shot,
          metadata: {
            ...object(shot.metadata),
            business_action_intelligence_hash: intelligence.intelligence_hash,
            business_action_assignment_hash: assignment.assignment_hash,
            commercial_narrative_hash: narrative.narrative_hash,
            business_action: shotAssignment,
            commercial_narrative: shotNarrative,
            shot_function: shotAssignment.primary_function || null,
            proof_ids: shotAssignment.proof_ids || [],
            action_ids: shotAssignment.action_ids || [],
            human_roles: shotAssignment.human_roles || [],
            communication_strategy: shotAssignment.communication || {},
            sound_strategy: shotAssignment.sound || {},
          },
        };
      }),
    };
  });

  return {
    ...plan,
    scenes,
    business_action_intelligence: intelligence,
    business_action_assignment: assignment,
    commercial_narrative: narrative,
    production: {
      ...object(plan.production),
      business_action_intelligence_required: true,
      business_action_assignment_required: true,
      commercial_narrative_required: true,
      communication_strategy_required: true,
      dynamic_sound_strategy_required: true,
      flat_music_bed_release_blocked: true,
      shot_function_assignment_required: true,
      proof_assignment_required_when_applicable: true,
      causal_commercial_story_required: true,
      unresolved_story_loop_release_blocked: true,
    },
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;
  const createWithoutBusinessAction =
    CreativeUniversalTemporalDirectionRuntime.create.bind(
      CreativeUniversalTemporalDirectionRuntime,
    );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    { value: true, enumerable: false, configurable: false },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithBusinessActionIntelligence(input = {}) {
      const directed = await createWithoutBusinessAction(input);
      if (!directed?.plan || directed.plan.workflow_kind !== "TEMPORAL") {
        return directed;
      }

      const intelligenceRun =
        await CreativeBusinessActionIntelligenceRuntime.create({
          input,
          directed,
        });
      const assignmentRun =
        await CreativeBusinessActionAssignmentRuntime.create({
          input,
          directed,
          intelligence: intelligenceRun.intelligence,
        });
      const actionPlan = enrichPlan(
        directed.plan,
        intelligenceRun.intelligence,
        assignmentRun.assignment,
        {},
      );
      const narrativeRun = await CreativeCommercialNarrativeRuntime.create({
        input,
        directed: {
          ...directed,
          plan: {
            ...actionPlan,
            business_action_intelligence: intelligenceRun.intelligence,
            business_action_assignment: assignmentRun.assignment,
          },
        },
      });
      const plan = enrichPlan(
        directed.plan,
        intelligenceRun.intelligence,
        assignmentRun.assignment,
        narrativeRun.narrative,
      );

      return {
        ...directed,
        plan,
        business_action_intelligence: intelligenceRun.intelligence,
        business_action_assignment: assignmentRun.assignment,
        commercial_narrative: narrativeRun.narrative,
        usage: {
          ...object(directed.usage),
          business_action_intelligence: intelligenceRun.result?.usage || null,
          business_action_assignment: assignmentRun.result?.usage || null,
          commercial_narrative: narrativeRun.result?.usage || null,
        },
        billing: {
          ...object(directed.billing),
          business_action_intelligence: intelligenceRun.result?.billing || null,
          business_action_assignment: assignmentRun.result?.billing || null,
          commercial_narrative: narrativeRun.result?.billing || null,
        },
      };
    };
}

install();

export const CreativeBusinessActionCoverageRuntime = Object.freeze({
  installed: true,
  intelligence_contract: CreativeBusinessActionIntelligenceRuntime.contract,
  assignment_contract: CreativeBusinessActionAssignmentRuntime.contract,
  commercial_narrative_contract: CreativeCommercialNarrativeRuntime.contract,
});
