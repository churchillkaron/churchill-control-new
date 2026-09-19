import test from "node:test";
import assert from "node:assert/strict";
import {
  creativeConceptHumanPlacePatienceFailures,
  creativeSceneHumanPlacePatienceFailures,
} from "../lib/creative/quality/runtime/CreativeHumanPlacePatienceTruthRuntime.js";

function groundedPlan() {
  return {
    temporal_contract: { human_place_patience_required: true },
    concept: {
      task_truth: {
        real_problem: "Operational fragmentation steals attention from people doing real work across places and systems.",
        human_tension: "People remain responsible for outcomes while administrative friction competes with the work itself.",
        brand_reason_to_exist: "The system earns a role by absorbing coordination friction without replacing human judgment.",
        evidence_refs: ["brief:operational-fragmentation"],
      },
      human_truth: {
        lived_behavior_or_ritual: "A worker checks a handwritten instruction, adjusts the physical task, then continues without acknowledging camera.",
        emotional_contradiction: "Competence and pressure coexist; the person knows the craft while the surrounding process remains fragile.",
        why_it_matters: "The audience recognizes responsibility and adaptation rather than an actor demonstrating an industry category.",
        evidence_refs: ["research:work-observation"],
      },      place_truth: {
        why_here_not_anywhere: "Weather, distance, architecture and local operating conditions change how the work is physically performed.",
        environmental_pressures: ["wind alters loose materials", "distance delays coordination"],
        cultural_or_working_details: ["paper handoffs remain visible", "tools and spaces shape how people coordinate"],
        evidence_refs: ["research:place-observation"],
      },
      patience_strategy: {
        what_to_withhold: "Do not explain the system before the audience has felt the human friction it exists to solve.",
        what_to_let_breathe: "Allow a real work action and its consequence to complete before moving to the next image.",
        exit_trigger: "Cut when a gesture, sound or completed action changes what the audience understands.",
        anti_stasis_rule: "Performance, sound, weather, depth, focus or composition must evolve during every held moment.",
      },
      world_class_execution_design: {
        human_consequence: "A small reduction in coordination friction gives a real person uninterrupted attention for the work that carries responsibility.",
        physical_evidence: [{
          detail: "A damp paper handoff bends around a gloved thumb beside a vibrating machine housing.",
          material_behavior: "Moisture softens the paper while vibration makes an unsecured edge flutter against the metal surface.",
          story_consequence: "The worker physically secures the note, changes a machine setting and only then does the next action become possible.",
        }],
        sound_tension: {
          sonic_motif: "A restrained mechanical pulse appears only when separate actions begin to align causally.",
          silence_strategy: "Remove score around the decisive handoff so wind, paper and machine state carry the audience question before the system is understood.",
          picture_locked_punctuation: "Each consequential state change is punctuated by its real acoustic event rather than a generic cinematic impact.",
          escalation: "Sparse environmental sound gradually gains structured rhythmic relationship as the causal connection becomes undeniable.",
        },
        causal_connection: {
          opening_question: "Why do isolated physical actions in distant operating environments begin resolving with the same strange precision?",
          propagation_rule: "Every new consequence must be triggered by a prior observable action or state change rather than coincidence or explanatory graphics.",
          proof_chain: ["paper handoff changes machine state", "machine state changes downstream human timing"],
          connection_reveal: "The audience recognizes that the same invisible coordination logic links the previously separate consequences before any explanatory brand statement appears.",
        },
        pacing: {
          breathing_space: "Hold long enough to watch one physical action complete and its consequence register before geography or subject changes.",
          minimum_hero_hold_seconds: 4,
          location_change_rule: "A new place is earned only after the current place has delivered a complete causal beat, not to manufacture scale through rapid montage.",
          anti_montage_rule: "Do not cut merely because another attractive location exists; each cut must transfer question, action, sound or consequence.",
        },
        payoff_realization: "The final beat changes the audience from observing isolated efficiencies to understanding that one connected intelligence has been shaping the causal chain all along.",
      },
    },
  };
}

function groundedScene() {
  return { human_place_patience: {
    human_observation: {
      required: true,
      observed_behavior: "The worker folds the used note, places it beside the tool and resumes without looking toward camera.",
      micro_detail: "A thumb smooths the damp paper edge before it is tucked away.",      relationship_or_consequence: "The note carries another person's decision and changes the next physical action.",
      non_performance_rule: "No smiling to camera, posed teamwork, presentation gesture or generic typing shorthand.",
    },
    place_observation: {
      required: true,
      sensory_fact: "Wind pushes loose material against the work surface while moisture beads on exposed metal.",
      behavioral_effect: "The worker braces the paper and changes body position before continuing the task.",
      material_or_weather_effect: "Moisture darkens fabric and leaves uneven reflective patches on metal.",
      sound_fact: "Wind masks distant voices while paper, clothing and machinery occupy distinct acoustic distances.",
    },
    patience_design: {
      required: true,
      held_question: "Will the handoff survive the physical conditions and reach the next action correctly?",
      internal_change: "The note deforms, is secured, read and then causes a change to the tool setting.",
      cut_trigger: "The tool engages after the adjustment, completing the causal action and earning the cut.",
      visual_evolution: "Wind, hand position, paper shape, focus and machine state evolve while the camera remains restrained.",
    },
  } };
}

test("evidence-backed human/place/patience truth passes", () => {
  assert.deepEqual(creativeConceptHumanPlacePatienceFailures(groundedPlan()), []);
  assert.deepEqual(creativeSceneHumanPlacePatienceFailures(groundedScene()), []);
});
test("generic soul/place/patience language fails closed", () => {
  const conceptFailures = creativeConceptHumanPlacePatienceFailures({
    temporal_contract: { human_place_patience_required: true },
    concept: {
      task_truth: { real_problem: "cinematic", human_tension: "emotional", brand_reason_to_exist: "premium", evidence_refs: [] },
      human_truth: { lived_behavior_or_ritual: "authentic", emotional_contradiction: "human", why_it_matters: "beautiful", evidence_refs: [] },
      place_truth: { why_here_not_anywhere: "atmospheric", environmental_pressures: [], cultural_or_working_details: [], evidence_refs: [] },
      patience_strategy: { what_to_withhold: "cinematic", what_to_let_breathe: "emotional", exit_trigger: "beautiful", anti_stasis_rule: "premium" },
    },
  });
  assert.ok(conceptFailures.includes("CONCEPT_REAL_TASK_PROBLEM_REQUIRED"));
  assert.ok(conceptFailures.includes("CONCEPT_HUMAN_EVIDENCE_REQUIRED"));
  assert.ok(conceptFailures.includes("CONCEPT_PLACE_SPECIFICITY_REQUIRED"));
  assert.ok(conceptFailures.includes("CONCEPT_PATIENCE_EXIT_TRIGGER_REQUIRED"));
  assert.ok(conceptFailures.includes("CONCEPT_PHYSICAL_EVIDENCE_REQUIRED"));
  assert.ok(conceptFailures.includes("CONCEPT_PICTURE_LOCKED_SOUND_REQUIRED"));
  assert.ok(conceptFailures.includes("CONCEPT_CAUSAL_PROOF_CHAIN_REQUIRED"));
  assert.ok(conceptFailures.includes("CONCEPT_EARNED_PAYOFF_REALIZATION_REQUIRED"));
});

test("patient scene without internal evolution fails", () => {
  const scene = groundedScene();
  scene.human_place_patience.patience_design.internal_change = "cinematic";
  assert.ok(creativeSceneHumanPlacePatienceFailures(scene).includes("SCENE_PATIENCE_INTERNAL_CHANGE_REQUIRED"));
});

test("beautiful technology montage fails without causal film language", () => {
  const plan = groundedPlan();
  plan.concept.world_class_execution_design = {
    human_consequence: "Technology makes the world more efficient in a premium and cinematic way.",
    physical_evidence: [],
    sound_tension: { sonic_motif: "cinematic", silence_strategy: "beautiful", picture_locked_punctuation: "premium", escalation: "emotional" },
    causal_connection: { opening_question: "something happens", propagation_rule: "things synchronize", proof_chain: [], connection_reveal: "the logo appears" },
    pacing: { breathing_space: "cinematic", minimum_hero_hold_seconds: 2, location_change_rule: "fast global montage", anti_montage_rule: "premium" },
    payoff_realization: "A beautiful raindrop reflects the logo.",
  };
  const failures = creativeConceptHumanPlacePatienceFailures(plan);
  assert.ok(failures.includes("CONCEPT_PHYSICAL_EVIDENCE_REQUIRED"));
  assert.ok(failures.includes("CONCEPT_MINIMUM_HERO_HOLD_REQUIRED"));
  assert.ok(failures.includes("CONCEPT_CAUSAL_PROOF_CHAIN_REQUIRED"));
  assert.ok(failures.includes("CONCEPT_PICTURE_LOCKED_SOUND_REQUIRED"));
});
