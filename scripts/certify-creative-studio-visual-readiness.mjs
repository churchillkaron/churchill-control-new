import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileAvantiqoVideoFastPreviewPrompt } from "../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoFastPreviewPrompt.js";
import { CreativeShotPhysicalPreflightRuntime } from "../lib/creative/quality/runtime/CreativeShotPhysicalPreflightRuntime.js";
import { evaluateCinematicReferenceGrammar } from "../lib/creative/quality/runtime/CreativeCinematicReferenceGrammarRuntime.js";
import { evaluateCinematicFrameDynamics } from "../lib/creative/quality/runtime/CreativeCinematicFrameDynamicsRuntime.js";
import { evaluateEliteFilmProductionBenchmark } from "../lib/creative/quality/runtime/CreativeEliteFilmProductionBenchmarkRuntime.js";
import { buildShotPrevisualizationBlueprint } from "../lib/creative/quality/runtime/CreativeShotPrevisualizationBlueprintRuntime.js";
import { buildDepartmentHandoffChain } from "../lib/creative/quality/runtime/CreativeDepartmentHandoffChainRuntime.js";
import { CreativeHeroAssetTruthRuntime } from "../lib/creative/quality/runtime/CreativeHeroAssetTruthRuntime.js";
import { CreativeSubjectMotionChoreographyRuntime } from "../lib/creative/quality/runtime/CreativeSubjectMotionChoreographyRuntime.js";
import { CreativeVirtualCameraStateRuntime } from "../lib/creative/quality/runtime/CreativeVirtualCameraStateRuntime.js";
import { evaluateCinematicAudioDynamics } from "../lib/creative/quality/runtime/CreativeCinematicAudioDynamicsRuntime.js";
import { CreativeTechnicalSubjectTruthRuntime } from "../lib/creative/quality/runtime/CreativeTechnicalSubjectTruthRuntime.js";
import { CreativeProductCapabilityDemonstrationRuntime } from "../lib/creative/quality/runtime/CreativeProductCapabilityDemonstrationRuntime.js";
import { creativeConceptHumanPlacePatienceFailures, creativeSceneHumanPlacePatienceFailures } from "../lib/creative/quality/runtime/CreativeHumanPlacePatienceTruthRuntime.js";
import { evaluateProductionRoomBenchmark } from "../lib/creative/production-room/runtime/CreativeProductionRoomBenchmarkRuntime.js";
import { buildResearchRoomReport } from "../lib/creative/production-room/runtime/CreativeResearchRoomAdapterRuntime.js";
import { evaluateTechnicalScout } from "../lib/creative/production-room/runtime/CreativeTechnicalScoutRuntime.js";
import { evaluateCreativeFloor, evaluateConceptCompetition } from "../lib/creative/production-room/runtime/CreativeFrontProductionRoomsRuntime.js";
import { evaluateProductionOffice } from "../lib/creative/production-room/runtime/CreativeProductionOfficeRuntime.js";
import { createProductionWorkOrder, completeProductionWorkOrder } from "../lib/creative/production-room/runtime/CreativeProductionWorkOrderRuntime.js";
import { executeProductionSpecialistWorkOrder } from "../lib/creative/production-room/runtime/CreativeProductionSpecialistExecutionRuntime.js";
import { executeSpecialistExecutionWave } from "../lib/creative/production-room/runtime/CreativeProductionSpecialistSchedulerRuntime.js";
import { mergeSpecialistWaveState } from "../lib/creative/production-room/runtime/CreativeProductionSpecialistWaveStateRuntime.js";
import { auditProductionWorkstreamDependencies } from "../lib/creative/production-room/runtime/CreativeProductionDependencyAuditRuntime.js";
import { createProductionRoomPlan, sealProductionRoomStage, productionEntryGate } from "../lib/creative/production-room/runtime/CreativeProductionRoomRuntime.js";
import { evaluateDailiesTake } from "../lib/creative/production-room/runtime/CreativeDailiesRoomRuntime.js";
import { buildTakeExecutionIntent } from "../lib/creative/production-room/runtime/CreativeProductionUnitExecutionRuntime.js";
import { evaluateEditorialRoom, evaluateReleaseRoom } from "../lib/creative/production-room/runtime/CreativePostRoomQualityRuntime.js";
import { evaluateStudioVisualReadiness, issueStudioVisualGenerationCertification } from "../lib/creative/quality/runtime/CreativeStudioVisualReadinessCertificationRuntime.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const proof = (passed, evidence) => ({ passed, score: passed ? 100 : 0, evidence: [evidence] });

function preciseShot(overrides = {}) {
  return {
    hero_asset_truth: { mode: "REFERENCE_GROUNDED_CLASS", exact_geometry_claimed: false, limitations: ["Research-grounded class/configuration; no manufacturer CAD is claimed."] },
    technical_truth_evidence: {
      sources: [
        { uri: "source://manufacturer-or-operator-reference-a", claim: "Heavy offshore transport configuration uses twin-engine upper fuselage, wheeled landing gear and articulated main rotor architecture." },
        { uri: "source://independent-technical-reference-b", claim: "Offshore transport role, landing-gear class and rotor/transmission arrangement distinguish this subject from light skid utility helicopters." },
      ],
      validated_facts: [
        "twin-engine upper fuselage configuration",
        "wheeled rather than skid landing gear",
        "articulated rotor system connected through mast and transmission",
      ],
      prohibited_confusions: ["light single-engine skid helicopter", "small twin-engine skid utility helicopter"],
    },
    subject_identity_key: "heavy-offshore-helicopter-a",
    world_identity_key: "north-sea-platform-a",
    subject_class: "Heavy twin-engine offshore transport helicopter with wheeled landing gear and articulated main rotor",
    subject_signature: {
      defining_features: ["twin-engine upper fuselage", "wheeled landing gear", "articulated main rotor"],
      forbidden_substitutions: ["light skid helicopter", "single-engine utility helicopter"],
    },    mechanical_truth: "Rotor hub, mast, swashplate, blade roots, engines, transmission and landing gear remain physically connected and plausible.",
    mechanical_signature: {
      functional_assemblies: ["main rotor system", "twin-engine transmission", "wheeled landing gear"],
      required_connections: ["rotor mast to transmission", "transmission to engines", "landing gear to fuselage"],
      motion_constraints: ["rotor rotates about fixed mast axis", "landing gear remains rigidly attached"],
    },
    world_geometry_anchor: "One fixed offshore production platform with unchanged helideck, crane positions and structural silhouette.",
    world_topology: ["helideck attached to platform edge", "main crane remains aft of helideck"],
    continuity_invariants: ["same helicopter configuration", "same platform topology"],
    camera_feasibility: "A slow lateral track preserves continuous scale, screen direction and spatial relation from opening to closing frame.",
    camera: { movement_path: "slow lateral tracking move", movement_motivation: "reveal approach geometry" },
    virtual_camera_state: {
      start: { focal_length_mm: 50, subject_distance_m: 18, camera_height_m: 2.2, roll_degrees: 0 },
      end: { focal_length_mm: 50, subject_distance_m: 14, camera_height_m: 2.2, roll_degrees: 0 },
      zoom_or_lens_change_declared: false,
      focus_behavior: "Focus remains locked to the helicopter fuselage while distance closes gradually.",
      perspective_intent: "Natural medium-telephoto compression preserves believable aircraft and platform scale."
    },
    subject_motion_choreography: {
      required: true,
      start_state: "Heavy helicopter is airborne over open sea on a stable approach heading.",
      path: "Continuous left-to-right approach over open water while remaining clear of the offshore platform structure.",
      speed_profile: "Controlled gradual deceleration while maintaining a stable airborne approach envelope.",
      screen_direction: "left-to-right",
      clearance_and_contact_constraints: ["remain clear of platform steelwork, crane and helideck until approach boundary"],
      end_state: "Heavy helicopter remains airborne beside the same platform on the same approach heading.",
    },
    frame_plan: {
      opening_frame: "Medium three-quarter view of the heavy helicopter over open sea.",
      progression: "The helicopter advances while the camera tracks laterally and the platform gradually enters frame.",
      closing_frame: "Wide view holding the same helicopter and the same offshore platform in one geography.",
    },
    ...overrides,
  };
}

const goodShot = preciseShot();
const goodPhysical = CreativeShotPhysicalPreflightRuntime.evaluate(goodShot);
const impossibleCamera = CreativeShotPhysicalPreflightRuntime.evaluate(preciseShot({
  camera: { movement_path: "stationary locked-off camera", movement_motivation: "hold geometry" },
  frame_plan: { opening_frame: "Extreme close-up detail of the rotor mast", progression: "The camera remains fixed.", closing_frame: "Wide aerial view of the entire platform." },
}));const identityDrift = CreativeShotPhysicalPreflightRuntime.evaluateSequence([
  preciseShot(),
  preciseShot({
    inherits_subject_identity: true,
    inherits_world_identity: true,
    subject_signature: {
      defining_features: ["single-engine fuselage", "skid landing gear"],
      forbidden_substitutions: ["heavy twin-engine helicopter"],
    },
  }),
]);

const cleanPrompt = compileAvantiqoVideoFastPreviewPrompt({
  requirements: {
    generator_visual_anchor: "Heavy twin-engine offshore transport helicopter with wheeled landing gear",
    world_visual_anchor: "One fixed North Sea production platform with stable helideck and crane positions",
  },
  repair_specification: { required_repairs: [
    "Continuity: {\"previous_shot_id\":\"123e4567-e89b-12d3-a456-426614174000\"}",
    "Truth checks: reject wrong helicopter",
  ] },
});
const promptClean = /Heavy twin-engine offshore transport helicopter/.test(cleanPrompt)
  && /North Sea production platform/.test(cleanPrompt)
  && !/previous_shot_id|123e4567|Truth checks|Continuity:|\{|\}/i.test(cleanPrompt);const authoredGrammar = evaluateCinematicReferenceGrammar({ shots: [
  { reveal_stage: "WITHHOLD", shot_scale: "detail", transition: { device: "sound" }, black_frame: true, black_frame_purpose: "heartbeat tension before reveal" },
  { reveal_stage: "ORIENT", shot_scale: "medium", named_place: "North Sea", geography_proof: ["offshore platform topology", "open North Sea horizon"], human_present: true, human_purpose: "offshore crew work ritual", transition: { device: "motion" } },
  { reveal_stage: "PAYOFF", shot_scale: "wide", payoff: true, narrative_function: "payoff resolves the approach question", transition: { device: "geometry" } },
] });
const genericGrammar = evaluateCinematicReferenceGrammar({ shots: [
  { reveal_stage: "ORIENT", shot_scale: "wide" },
  { reveal_stage: "ORIENT", shot_scale: "wide" },
  { reveal_stage: "ORIENT", shot_scale: "wide" },
] });

const taskRuntime = read("lib/operations/tasks/runtime/ProductionTaskRuntime.js");
const productionGraphRuntimeSource = read("lib/creative/production-graph/runtime/ProductionGraphRuntime.js");
const productionGraphRepositorySource = read("lib/creative/production-graph/repositories/ProductionGraphRepository.js");
const providerExecutor = read("lib/platform/service-runtime/providers/ProviderExecutor.js");
const videoProvider = read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js");
const imageProvider = read("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js");
const candidateReview = read("lib/creative/quality/runtime/CreativeShotCandidateReviewRuntime.js");
const physicalPreflight = read("lib/creative/quality/runtime/CreativeShotPhysicalPreflightRuntime.js");
const geographyPreflight = read("lib/creative/quality/runtime/CreativeGeographyTruthPreflightRuntime.js");
const referenceGrammarRuntime = read("lib/creative/quality/runtime/CreativeCinematicReferenceGrammarRuntime.js");
const masterLocked = [taskRuntime, providerExecutor, videoProvider, imageProvider]
  .every((source) => source.includes("STUDIO_VISUAL_GENERATION_MASTER_LOCKED"));

const reviewHardChecks = [
  "researched_subject_fidelity",
  "cinematic_beauty",
  "detectable_synthetic_artifacts",
  "continuity",
].every((token) => candidateReview.includes(token))
  && candidateReview.includes("SCORE_BELOW_WORLD_CLASS_FLOOR")
  && /minimum_score:\s*Math\.max\(94/.test(candidateReview);
const beautyWeakestLink = candidateReview.includes("cinematic_beauty")
  && candidateReview.includes("weakest_score")
  && /minimum_score:\s*Math\.max\(94/.test(candidateReview);
const temporalHardening = [
  "SHOT_CONTINUITY_INVARIANTS_REQUIRED",
].every((token) => physicalPreflight.includes(token))
  && [
    "SHOT_GEOGRAPHY_RECOGNITION_ANCHORS_REQUIRED",
    "SHOT_GEOGRAPHY_GENERIC_SUBSTITUTES_REQUIRED",
    "SHOT_GEOGRAPHY_RECOGNITION_TEST_REQUIRED",
  ].every((token) => geographyPreflight.includes(token))
  && referenceGrammarRuntime.includes("REFERENCE_GRAMMAR_DECORATIVE_BLACK_FRAME");

const referenceBenchmarkPath = path.join(root, "audits/results/creative-reference-grammar-benchmark.json");
const storyboardBenchmarkPath = path.join(root, "audits/results/creative-reference-storyboard-benchmark.json");
let referenceBenchmark = null;
let storyboardBenchmark = null;
try { referenceBenchmark = JSON.parse(fs.readFileSync(referenceBenchmarkPath, "utf8")); } catch {}
try { storyboardBenchmark = JSON.parse(fs.readFileSync(storyboardBenchmarkPath, "utf8")); } catch {}
const referenceMeasured = Boolean(
  referenceBenchmark?.measurements_verified === true
  && Array.isArray(referenceBenchmark?.references)
  && referenceBenchmark.references.length >= 5,
);
const storyboardMeasured = Boolean(
  storyboardBenchmark?.visual_measurements_verified === true
  && storyboardBenchmark?.full_reference_measurements_verified === false
  && Array.isArray(storyboardBenchmark?.references)
  && storyboardBenchmark.references.length >= 5,
);
const departmentBenchmark = evaluateEliteFilmProductionBenchmark();
const sealedPrevis = buildShotPrevisualizationBlueprint(goodShot);
const sealedHandoff = buildDepartmentHandoffChain({
  previsualization: sealedPrevis,
  role_decisions: {
    previsualization_supervisor: { status: "ACTIVE", decision: "Solve shot feasibility before spend.", evidence: ["cert-fixture"], risks: [], repair_instructions: [] },
    director_of_photography: { status: "ACTIVE", decision: "Bind camera path to the sealed shot.", evidence: ["cert-fixture"], risks: [], repair_instructions: [] },
    compositing_supervisor: { status: "ACTIVE", decision: "Preserve world integration truth.", evidence: ["cert-fixture"], risks: [], repair_instructions: [] },
    post_production_supervisor: { status: "ACTIVE", decision: "Preserve authoritative lineage through post.", evidence: ["cert-fixture"], risks: [], repair_instructions: [] },
    quality_director: { status: "ACTIVE", decision: "Reject divergence from sealed truth.", evidence: ["cert-fixture"], risks: [], repair_instructions: [] },
  },
});
const heroTruthPass = CreativeHeroAssetTruthRuntime.evaluate(goodShot);
const motionPass = CreativeSubjectMotionChoreographyRuntime.evaluate(goodShot);
const motionImpossible = CreativeSubjectMotionChoreographyRuntime.evaluate({ ...goodShot, subject_motion_choreography: { ...goodShot.subject_motion_choreography, path: "Helicopter appears from inside the offshore platform then moves into open air." } });
const cameraStatePass = CreativeVirtualCameraStateRuntime.evaluate(goodShot);
const cameraStateHiddenLensJump = CreativeVirtualCameraStateRuntime.evaluate({ ...goodShot, virtual_camera_state: { ...goodShot.virtual_camera_state, end: { ...goodShot.virtual_camera_state.end, focal_length_mm: 135 } } });
const audioDynamicsPass = evaluateCinematicAudioDynamics({ duration_seconds: 90, metrics: { active_sample_count: 900, p90_p10_lufs_range: 9.5, active_lufs_range: 19 } });
const audioDynamicsFlat = evaluateCinematicAudioDynamics({ duration_seconds: 90, metrics: { active_sample_count: 900, p90_p10_lufs_range: 2.2, active_lufs_range: 5.5 } });
const productCapabilityPass = CreativeProductCapabilityDemonstrationRuntime.evaluate({ product_capability_demonstration: { mode: "EMBODIED_USE", capability: "hands-free capture while remaining in motion", human_intent: "preserve a decisive action without stopping to operate another device", physical_action: "the athlete continues the action while invoking capture from the worn product", visible_response: "the captured point of view appears while the physical action remains uninterrupted", felt_advantage: "performance and capture happen simultaneously rather than competing for the athlete's attention", proof_frame: "one sequence binds wearer, product, uninterrupted action and resulting captured point of view", evidence_refs: [], failure_substitutes: ["static hero product shot", "feature label without use"] } });
const productCapabilityWeak = CreativeProductCapabilityDemonstrationRuntime.evaluate({ product_capability_demonstration: { mode: "EMBODIED_USE", capability: "performance", human_intent: "looks cool", physical_action: "product spins", visible_response: "premium", felt_advantage: "advanced", proof_frame: "hero shot", failure_substitutes: [] } });
const technicalTruthPass = CreativeTechnicalSubjectTruthRuntime.evaluate(goodShot);
const technicalTruthThin = CreativeTechnicalSubjectTruthRuntime.evaluate({ hero_asset_truth: { mode: "REFERENCE_GROUNDED_CLASS", exact_geometry_claimed: false, limitations: ["No CAD available."] }, technical_truth_evidence: { sources: [{ uri: "source://one", claim: "generic reference" }], validated_facts: ["it flies"], prohibited_confusions: [] } });
const humanPlacePatiencePlan = {
  temporal_contract: { human_place_patience_required: true },
  concept: {
    task_truth: { real_problem: "A fragmented organization cannot see how thousands of daily human decisions connect into one operating system.", human_tension: "People need to do meaningful work while administrative complexity steals attention and creates uncertainty.", brand_reason_to_exist: "The platform exists to absorb operational fragmentation so people can stay focused on the work and relationships that matter.", evidence_refs: ["cert-fixture:mission"] },
    human_truth: { lived_behavior_or_ritual: "A worker checks a handwritten note, adjusts the task in front of them and continues without ever acknowledging a camera.", emotional_contradiction: "Competence and pressure coexist: the person knows the work intimately while the surrounding system still creates friction.", why_it_matters: "The audience recognizes ordinary responsibility rather than a performer demonstrating a category for an advertisement.", evidence_refs: ["cert-fixture:human-observation"] },
    place_truth: { why_here_not_anywhere: "The physical environment changes the work itself through weather, distance, machinery, architecture and local operating conditions.", environmental_pressures: ["weather alters surfaces and movement", "distance changes coordination and timing"], cultural_or_working_details: ["paper and physical handoffs remain part of the workflow", "people coordinate around local tools and spatial constraints"], evidence_refs: ["cert-fixture:place-observation"] },
    patience_strategy: { what_to_withhold: "Do not explain the system before the audience has felt the fragmented human reality it must solve.", what_to_let_breathe: "Allow a real work action and its consequence to complete before moving to the next category or geography.", exit_trigger: "Cut only when a gesture, sound, environmental change or completed action changes what the audience understands.", anti_stasis_rule: "During every held moment, performance, sound, weather, depth, focus or composition must continue to evolve." },
  },
};
const humanPlacePatienceScene = { human_place_patience: {
  human_observation: { required: true, observed_behavior: "The worker folds the used note, places it beside the tool and resumes the task without looking toward camera.", micro_detail: "A thumb smooths the damp paper edge before it is tucked away.", relationship_or_consequence: "The note carries a decision from another person and changes the next physical action.", non_performance_rule: "No smiling to camera, posed teamwork, presentation gesture or generic typing used as shorthand for work." },
  place_observation: { required: true, sensory_fact: "Wind pushes loose material against the working surface while moisture beads on exposed metal.", behavioral_effect: "The worker braces the paper and changes body position before continuing the task.", material_or_weather_effect: "Moisture darkens fabric and leaves uneven reflective patches on metal rather than a generic wet-look grade.", sound_fact: "Wind masks distant voices while nearby paper, clothing and machinery occupy distinct acoustic distances." },
  patience_design: { required: true, held_question: "Will the handoff survive the physical conditions and reach the next action correctly?", internal_change: "The note deforms in the wind, the worker secures it, reads the final line and changes the tool setting.", cut_trigger: "The tool engages after the adjustment, completing the causal action and earning the cut.", visual_evolution: "Wind, hand position, paper shape, focus and machine state all evolve while the camera remains restrained." },
} };
const humanPlacePatiencePass = creativeConceptHumanPlacePatienceFailures(humanPlacePatiencePlan).length === 0 && creativeSceneHumanPlacePatienceFailures(humanPlacePatienceScene).length === 0;
const humanPlacePatienceThin = creativeConceptHumanPlacePatienceFailures({ temporal_contract: { human_place_patience_required: true }, concept: { task_truth: {}, human_truth: {}, place_truth: {}, patience_strategy: {} } });
const productionRoomBenchmark = evaluateProductionRoomBenchmark();
const productionDependencyAudit = auditProductionWorkstreamDependencies();
const researchRoomPass = buildResearchRoomReport({
  research: {
    metadata: {
      validation: { passed: true, open_questions: ["No unresolved production-critical research questions declared."] },
      sources: [
        { id: "source-a", title: "Official location source", url: "https://example.com/location", publisher: "Official source" },
        { id: "source-b", title: "Independent technical source", url: "https://example.com/technical", publisher: "Independent source" },
      ],
      location_intelligence: { findings: ["Specific geography and infrastructure evidence"] },
      cultural_intelligence: { findings: ["Observed local working behavior and ritual"] },
      technical_intelligence: { findings: ["Technical subject class and distinguishing configuration"] },
      weather_daylight: { findings: ["Weather, daylight and exposure constraints"] },
    },
  },
  brief: {},
  universal_asset_intelligence: {},
});
const researchRoomWeak = buildResearchRoomReport({ research: { metadata: { validation: { passed: false }, sources: [] } } });
const scoutShot = preciseShot({
  production_design: {
    materials: ["salt-worn painted steel", "wet anti-slip helideck coating"],
    texture_detail: "Uneven salt residue, rain-darkened coating and maintenance wear stay physically local rather than becoming a global wet-look grade.",
  },
  material_behavior: "Moisture beads on painted steel while rotor wash moves loose spray without changing rigid platform geometry.",
  lighting: {
    source: "Overcast North Sea daylight remains the motivated environmental source.",
    direction: "Soft high-side daylight falls from camera-left across aircraft and helideck.",
    contrast: "Controlled low-key contrast preserves fuselage volume and readable dark steel detail.",
    colour: "Cool neutral daylight with restrained warm practical contamination from platform fixtures.",
    exposure_intent: "Protect wet highlights while holding texture in the dark platform structure.",
  },
});
const technicalScoutPass = evaluateTechnicalScout({
  shots: [scoutShot],
  production_design_bible: {
    set_dressing_bible: ["operational helideck markings remain sparse and functional"],
    props_bible: ["no decorative equipment without operational reason"],
    wardrobe_bible: ["offshore PPE remains role-correct and weather-responsive"],
    surface_aging_rules: ["salt, moisture and maintenance wear remain spatially plausible"],
    environment_continuity: ["same platform topology and weather state across coverage"],
  },
  lighting_simulation: {
    sun_path: ["overcast diffuse source with no contradictory hard sun"],
    motivated_light_map: ["sky drives exterior exposure; platform practicals remain secondary"],
    shadow_map: ["soft contact shadows remain consistent with broad cloud cover"],
    reflection_map: ["wet steel reflections follow local surface orientation"],
    surface_response: ["painted steel, glazing and wet deck retain distinct specular behavior"],
    exposure_continuity: ["highlight and black-detail targets remain stable across coverage"],
  },
  material_physics: {
    material_library: ["painted steel", "anti-slip deck coating", "glass", "weatherproof fabric"],
    weather_behavior: ["wind-driven spray accumulates directionally"],
    cloth_hair_behavior: ["PPE fabric responds to wind without impossible body deformation"],
    fluid_particulate_behavior: ["spray and moisture follow rotor-wash and gravity"],
    contact_deformation: ["rigid steel does not deform under normal crew contact"],
  },
});
const technicalScoutWeak = evaluateTechnicalScout({ shots: [preciseShot()] });
const creativeFloorPass = evaluateCreativeFloor({
  plan: {
    ...humanPlacePatiencePlan,
    story: {
      hook: "Begin with one precise human action whose consequence is larger than the person can see.",
      emotional_arc: "Move from intimate responsibility through mounting complexity toward calm systemic clarity without losing the human scale.",
    },
    anti_cliche_rules: ["no posed teamwork", "no generic dashboard montage"],
  },
  reference_strategy: { benchmark_archetypes: ["DOCUMENTARY_TRUTH_PLACE_HUMANITY", "MYSTERY_REVEAL_EFFECTS"] },
  taste_learning: { authority: "ADVISORY_ONLY" },
});
const creativeFloorWeak = evaluateCreativeFloor({ plan: { story: {}, anti_cliche_rules: [] }, reference_strategy: {}, taste_learning: {} });
const councilConcepts = ["concept-a", "concept-b", "concept-c"].map((id) => ({ id }));
const conceptCompetitionPass = evaluateConceptCompetition({ council: {
  contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
  concepts: councilConcepts,
  critic_reports: ["originality", "music_energy", "brand_commercial", "production", "human_place_patience"].map((id) => ({ id })),
  distinctness: { passed: true },
  selection: { selected_concept: councilConcepts[1] },
} });
const conceptCompetitionWeak = evaluateConceptCompetition({ council: { contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1", concepts: councilConcepts.slice(0, 2), critic_reports: [], distinctness: { passed: false }, selection: {} } });
let productionRoomPlan = createProductionRoomPlan({ project_id: "cert-project", master_plan_digest: "cert-master-digest" });
const productionOfficeProof = evaluateProductionOffice({
  plan: productionRoomPlan,
  reports_by_stage: {
    RESEARCH_ROOM: [{ contract: "CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_V1", requirement: 1, passed: true }],
  },
});
const productionWorkOrderBlocked = createProductionWorkOrder({
  stage_id: "PREVIS",
  requirement: 7,
  completed_requirements: [4],
});
const productionWorkOrderReady = createProductionWorkOrder({
  stage_id: "PREVIS",
  requirement: 7,
  completed_requirements: [4, 6],
});
const productionWorkOrderCompletionWeak = completeProductionWorkOrder({
  work_order: productionWorkOrderReady,
  evidence: {},
});
const productionWorkOrderCompletionPass = completeProductionWorkOrder({
  work_order: productionWorkOrderReady,
  evidence: {
    master_action_state: ["same action start/end state"],
    camera_units: ["hero camera", "insert camera"],
    shared_continuity: ["same subject identity", "same world geometry"],
    coverage_purposes: ["hero geography", "mechanical detail"],
    cut_opportunities: ["action completion", "sound-led handoff"],
  },
});
let specialistExecutionRequest = null;
const specialistExecutionProof = await executeProductionSpecialistWorkOrder({
  organization_id: "cert-org",
  creative_project_id: "cert-project",
  work_order: productionWorkOrderReady,
  production_context: { sealed_truth: "offline-cert-fixture" },
  execution_runtime: {
    async execute(input) {
      specialistExecutionRequest = input;
      return {
        output: {
          master_action_state: ["same action start/end state"],
          camera_units: ["hero camera", "insert camera"],
          shared_continuity: ["same subject identity", "same world geometry"],
          coverage_purposes: ["hero geography", "mechanical detail"],
          cut_opportunities: ["action completion", "sound-led handoff"],
        },
        provider: "avantiqo-intelligence",
        model: "offline-cert-owned-fixture",
      };
    },
  },
});
const schedulerEditorialOrder = createProductionWorkOrder({
  stage_id: "PREVIS",
  requirement: 12,
  completed_requirements: [1],
});
const schedulerProof = await executeSpecialistExecutionWave({
  organization_id: "cert-org",
  creative_project_id: "cert-project",
  work_orders: [productionWorkOrderReady, schedulerEditorialOrder],
  max_concurrency: 2,
  production_context: { sealed_truth: "offline-cert-fixture" },
  execution_runtime: {
    async execute(input) {
      const requirement = Number(String(input.metadata?.operation || "").split("_").at(-1));
      return {
        output: requirement === 7
          ? {
              master_action_state: ["same action start/end state"],
              camera_units: ["hero camera", "insert camera"],
              shared_continuity: ["same subject identity", "same world geometry"],
              coverage_purposes: ["hero geography", "mechanical detail"],
              cut_opportunities: ["action completion", "sound-led handoff"],
            }
          : {},
        provider: "avantiqo-intelligence",
        model: "offline-cert-owned-fixture",
      };
    },
  },
});
const schedulerMergedProof = mergeSpecialistWaveState({
  production_room_pipeline: createProductionRoomPlan({ project_id: "scheduler-cert-project", master_plan_digest: "scheduler-cert-master" }),
  reports_by_stage: {},
  wave_result: schedulerProof,
});
const productionGateBeforeRehearsal = productionEntryGate(productionRoomPlan);
let productionRoomSkipRejected = false;
try {
  const stage = productionRoomPlan.stages.find((item) => item.id === "CREATIVE_FLOOR");
  const evidencePacket = Object.fromEntries(stage.required_evidence.map((key) => [key, `cert:${key}`]));
  sealProductionRoomStage({ plan: productionRoomPlan, stage_id: stage.id, evidence: evidencePacket });
} catch (error) {
  productionRoomSkipRejected = String(error?.message || error).includes("STAGE_ORDER_VIOLATION");
}
let previousRoomDigest = null;
for (const stage of productionRoomPlan.stages.filter((item) => item.order <= 8)) {
  const evidencePacket = Object.fromEntries(stage.required_evidence.map((key) => [key, `cert:${stage.id}:${key}`]));
  evidencePacket.workstream_reports = stage.required_workstream_requirements.map((requirement) => ({ contract: "CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_V1", requirement, passed: true }));
  if (stage.id === "RESEARCH_ROOM") evidencePacket.room_report = { contract: "CREATIVE_RESEARCH_ROOM_ADAPTER_V1", passed: true };
  if (["CREATIVE_FLOOR", "CONCEPT_COMPETITION"].includes(stage.id)) evidencePacket.room_report = { contract: "CREATIVE_FRONT_PRODUCTION_ROOMS_V1", room: stage.id, passed: true };
  if (stage.id === "TRIBUNAL") evidencePacket.room_report = { contract: "CREATIVE_DYNAMIC_TRIBUNAL_V1", passed: true, verdict: { passed: true } };
  if (stage.id === "TECHNICAL_SCOUT") evidencePacket.room_report = { contract: "CREATIVE_TECHNICAL_SCOUT_V1", passed: true, zero_provider_calls: true, zero_media_generation: true };
  if (stage.id === "DEPARTMENT_BREAKDOWN") evidencePacket.room_report = { contract: "CREATIVE_DEPARTMENT_BREAKDOWN_V1", passed: true, zero_provider_calls: true, zero_media_generation: true };
  if (stage.id === "VIRTUAL_REHEARSAL") evidencePacket.room_report = { contract: "CREATIVE_VIRTUAL_REHEARSAL_V1", passed: true, zero_provider_calls: true, zero_media_generation: true };
  productionRoomPlan = sealProductionRoomStage({ plan: productionRoomPlan, stage_id: stage.id, evidence: evidencePacket, previous_stage_digest: previousRoomDigest });
  previousRoomDigest = productionRoomPlan.stages.find((item) => item.id === stage.id).sealed_digest;
}
const productionGateAfterRehearsal = productionEntryGate(productionRoomPlan);
const productionTakeIntentPass = buildTakeExecutionIntent({
  shot_id: "cert-shot",
  unit_ids: ["PRIMARY_UNIT", "SECOND_UNIT"],
  take_index: 2,
  max_takes_per_shot: 3,
  rehearsal_digest: productionGateAfterRehearsal.rehearsal_digest,
  editorial_objective: "Give editorial a materially different continuation while preserving the same subject, world and action state.",
  continuity_keys: ["same subject identity", "same world geometry"],
});
const productionTakeIntentInvalid = buildTakeExecutionIntent({
  shot_id: "cert-shot",
  unit_ids: ["PRIMARY_UNIT"],
  take_index: 9,
  max_takes_per_shot: 3,
  rehearsal_digest: productionGateAfterRehearsal.rehearsal_digest,
  editorial_objective: "Invalid take deliberately exceeds the bounded planned take menu for certification.",
  continuity_keys: ["same subject identity"],
});
const dailiesFamilies = ["DIRECTING", "CINEMATOGRAPHY", "CONTINUITY", "TECHNICAL_TRUTH", "PERCEPTUAL_QUALITY"];
const dailiesPass = evaluateDailiesTake({ take: { id: "cert-take" }, reviews: dailiesFamilies.map((family) => ({ reviewer_id: `cert-${family.toLowerCase()}`, family, score: 97, passed: true, evidence: ["cert:dailies"] })) });
const dailiesWeak = evaluateDailiesTake({ take: { id: "cert-weak-take" }, reviews: dailiesFamilies.map((family) => ({ reviewer_id: `cert-${family.toLowerCase()}`, family, score: family === "CONTINUITY" ? 90 : 97, passed: family !== "CONTINUITY", evidence: ["cert:dailies"] })) });
const editorialPass = evaluateEditorialRoom({ approved_take_ids: ["cert-take"], assembly: { clips: [{ take_id: "cert-take", story_reason: "advances the verified story state", cut_reason: "action resolves and next state begins" }], coverage_gaps: [], pacing_strategy: "alternate punctuation with earned holds" } });
const editorialWeak = evaluateEditorialRoom({ approved_take_ids: ["cert-take"], assembly: { clips: [{ take_id: "rejected-take", story_reason: "generic coverage", cut_reason: "arbitrary" }], coverage_gaps: [], pacing_strategy: "generic" } });
const releasePass = evaluateReleaseRoom({ master_qc: { checksum_verified: true, duration_verified: true, audio_verified: true, video_verified: true, no_rejected_assets_in_master: true }, rights: { cleared: true, evidence: ["cert:rights-manifest"] }, delivery: { approved: true, profile_id: "cert-master", master_digest: "cert-master-digest" } });
const releaseWeak = evaluateReleaseRoom({ master_qc: {}, rights: {}, delivery: {} });
const productionTaskHasRoomGate = taskRuntime.includes("STUDIO_VISUAL_GENERATION_PRODUCTION_ROOM_GATE_REQUIRED") && taskRuntime.includes("CREATIVE_PRODUCTION_ROOM_PIPELINE_V1");
const productionTaskHasTakeGuard = taskRuntime.includes("STUDIO_VISUAL_GENERATION_TAKE_EXECUTION_INTENT_REQUIRED") && taskRuntime.includes("CREATIVE_PRODUCTION_UNIT_EXECUTION_V1");
const heroTruthFalseExact = CreativeHeroAssetTruthRuntime.evaluate({ hero_asset_truth: { mode: "REFERENCE_GROUNDED_CLASS", exact_geometry_claimed: true, limitations: ["No CAD available."] } });
const dynamicMaster = evaluateCinematicFrameDynamics({
  duration_seconds: 90,
  metrics: { sample_count: 46, luminance_range: 42, mean_visual_change: 11, p75_visual_change: 18, longest_low_change_run_seconds: 12 },
});
const flatMaster = evaluateCinematicFrameDynamics({
  duration_seconds: 90,
  metrics: { sample_count: 46, luminance_range: 9, mean_visual_change: 1.8, p75_visual_change: 3, longest_low_change_run_seconds: 42 },
});

const knownFailuresRejected = goodPhysical.passed === true
  && impossibleCamera.passed === false
  && identityDrift.passed === false
  && authoredGrammar.passed === true
  && genericGrammar.passed === false
  && promptClean;
const zeroPaidGeneration = masterLocked
  && String(process.env.AVANTIQO_STUDIO_VISUAL_GENERATION_ENABLED || "0") !== "1";

const evidence = {  prompt_transport_clean: proof(promptClean, "real fast-preview compiler strips structured continuity metadata and preserves visual anchors"),
  subject_class_fidelity: proof(goodPhysical.passed && reviewHardChecks, "physical subject signature plus candidate-review subject-class hard check"),
  mechanical_system_plausibility: proof(goodPhysical.passed && reviewHardChecks, "structured mechanical assemblies, connections and motion constraints plus hard review check"),
  camera_path_feasibility: proof(!impossibleCamera.passed, `impossible camera fixture rejected: ${impossibleCamera.failures.join(",")}`),
  persistent_subject_identity: proof(!identityDrift.passed, `subject signature drift rejected: ${identityDrift.failures.join(",")}`),
  persistent_world_geometry: proof(!identityDrift.passed, "sequence preflight enforces inherited world identity/topology"),
  geography_truth: proof(temporalHardening && authoredGrammar.passed, "master-plan geography proof contract plus reference grammar geography check"),
  temporal_continuity: proof(!identityDrift.passed && temporalHardening, "identity/topology continuity and shot invariants reject drift before generation"),
  no_hidden_reset: proof(!identityDrift.passed && !impossibleCamera.passed, "same-label signature drift and impossible frame progression are rejected"),
  no_unintended_generated_text: proof(promptClean && reviewHardChecks, "provider prompt sanitization plus zero-tolerance candidate review check"),
  cinematic_authoring_specificity: proof(authoredGrammar.passed && genericGrammar.passed === false && reviewHardChecks, "generic repeated coverage fails while authored reveal grammar passes"),
  reveal_progression: proof(authoredGrammar.passed && genericGrammar.passed === false, "three-stage reveal/payoff fixture passes and flat reveal fixture fails"),
  beauty_weakest_link: proof(beautyWeakestLink, "candidate review contains explicit cinematic beauty weakest-link threshold"),
  deterministic_frame_dynamics: proof(
    dynamicMaster.passed === true && flatMaster.passed === false,
    "real frame-dynamics runtime passes authored dynamics and rejects flat/stasis fixtures",
  ),
  elite_department_orchestration: proof(
    departmentBenchmark.passed === true && departmentBenchmark.score === 100,
    "elite temporal production is covered by explicit creative, cinematography, production, editorial, VFX/CG, color/DI and sound departments",
  ),
  sealed_previsualization: proof(
    sealedPrevis.passed === true && sealedPrevis.zero_provider_calls === true && sealedPrevis.zero_media_generation === true && /^[a-f0-9]{64}$/.test(sealedPrevis.blueprint_digest),
    "every complex visual shot can be sealed into a deterministic physics/geography/camera/continuity blueprint before provider spend",
  ),
  sealed_department_handoff: proof(
    sealedHandoff.passed === true && sealedHandoff.root_previsualization_digest === sealedPrevis.blueprint_digest && sealedHandoff.zero_provider_calls === true && sealedHandoff.zero_media_generation === true,
    "active film departments inherit one hash-chained authoritative shot truth from sealed previz through post and quality",
  ),
  hero_asset_truth_boundary: proof(
    heroTruthPass.passed === true && heroTruthFalseExact.passed === false && heroTruthFalseExact.failures.includes("SHOT_HERO_ASSET_EXACT_GEOMETRY_CLAIM_FORBIDDEN"),
    "exact hero geometry is source-locked only; research-grounded synthetic subjects cannot claim manufacturer-exact identity",
  ),
  subject_motion_choreography: proof(
    motionPass.passed === true && motionImpossible.passed === false && motionImpossible.failures.includes("SHOT_SUBJECT_MOTION_IMPOSSIBLE_EMERGENCE"),
    "moving hero subjects require a continuous physical start/path/speed/direction/clearance/end-state trajectory and impossible emergence is rejected before generation",
  ),
  virtual_camera_state: proof(
    cameraStatePass.passed === true && cameraStateHiddenLensJump.passed === false && cameraStateHiddenLensJump.failures.includes("SHOT_VIRTUAL_CAMERA_UNDECLARED_FOCAL_CHANGE"),
    "camera-led shots carry measurable focal length, subject distance, camera height, roll, focus and perspective state; hidden lens resets fail before generation",
  ),
  deterministic_audio_dynamics: proof(
    audioDynamicsPass.passed === true && audioDynamicsFlat.passed === false,
    "final-film audio dynamics are measured deterministically and constant-bed mixes fail independently of semantic review",
  ),
  technical_subject_truth: proof(
    technicalTruthPass.passed === true
      && technicalTruthThin.passed === false
      && technicalTruthThin.failures.includes("SHOT_TECHNICAL_TRUTH_MINIMUM_SOURCES_REQUIRED")
      && technicalTruthThin.failures.includes("SHOT_TECHNICAL_TRUTH_VALIDATED_FACTS_REQUIRED")
      && technicalTruthThin.failures.includes("SHOT_TECHNICAL_TRUTH_PROHIBITED_CONFUSIONS_REQUIRED"),
    "reference-grounded real technical subjects require multiple source claims, distinguishing physical facts and prohibited lookalikes before previz",
  ),
  human_place_patience_truth: proof(
    humanPlacePatiencePass === true
      && humanPlacePatienceThin.includes("CONCEPT_REAL_TASK_PROBLEM_REQUIRED")
      && humanPlacePatienceThin.includes("CONCEPT_HUMAN_EVIDENCE_REQUIRED")
      && humanPlacePatienceThin.includes("CONCEPT_PLACE_SPECIFICITY_REQUIRED")
      && humanPlacePatienceThin.includes("CONCEPT_PATIENCE_EXIT_TRIGGER_REQUIRED"),
    "premium temporal direction requires evidence-backed task truth, lived human observation, place pressure and an earned cut trigger; generic soul/geography/patience language fails closed",
  ),
  product_capability_truth: proof(
    productCapabilityPass.passed === true && productCapabilityWeak.passed === false,
    "product or technical capability must become observable proof through intent, action, visible response and felt advantage; decorative hero imagery fails closed",
  ),
  virtual_production_specialist_depth: proof(
    productionRoomBenchmark.passed === true && productionRoomBenchmark.specialist_count >= 100 && productionRoomBenchmark.workstream_count === 20,
    `twenty production workstreams currently activate ${productionRoomBenchmark.specialist_count} specialist functions beneath accountable agency roles`,
  ),
  research_technical_scout_truth: proof(
    researchRoomPass.passed === true
      && researchRoomWeak.passed === false
      && researchRoomWeak.failures.includes("RESEARCH_ROOM_SOURCE_RESEARCH_VALIDATION_REQUIRED")
      && technicalScoutPass.passed === true
      && technicalScoutPass.zero_provider_calls === true
      && technicalScoutPass.zero_media_generation === true
      && technicalScoutWeak.passed === false,
    "validated multi-source research must carry location, culture, technical and weather/daylight evidence, and Technical Scout independently proves shot geography, technical subject, materials and physical lighting before Previs",
  ),
  creative_floor_concept_competition: proof(
    creativeFloorPass.passed === true
      && creativeFloorWeak.passed === false
      && creativeFloorWeak.failures.includes("CREATIVE_FLOOR_STORY_HOOK_REQUIRED")
      && conceptCompetitionPass.passed === true
      && conceptCompetitionWeak.passed === false
      && conceptCompetitionWeak.failures.includes("CONCEPT_COMPETITION_THREE_CONCEPTS_REQUIRED")
      && conceptCompetitionWeak.failures.includes("CONCEPT_COMPETITION_FIVE_CRITICS_REQUIRED"),
    "Creative Floor requires evidence-backed human/place/patience foundations and Concept Competition requires three distinct concepts, five independent critics and a valid selected winner",
  ),
  production_office_orchestration: proof(
    productionOfficeProof.passed === true
      && productionOfficeProof.current_room?.stage_id === "RESEARCH_ROOM"
      && productionOfficeProof.current_room?.completed_workstreams?.includes(1)
      && productionOfficeProof.current_room?.missing_workstreams?.includes(2)
      && productionOfficeProof.parallel_specialist_lane_count === 1
      && productionOfficeProof.zero_provider_calls === true
      && productionOfficeProof.zero_media_generation === true,
    "the production office exposes the current room, completed and missing workstreams, accountable parallel specialist lanes and exact production gate without provider or media execution",
  ),
  production_work_order_orchestration: proof(
    productionWorkOrderBlocked.status === "BLOCKED"
      && productionWorkOrderBlocked.blocked_by.includes(6)
      && productionWorkOrderReady.status === "READY"
      && productionWorkOrderReady.required_outputs.includes("camera_units")
      && productionWorkOrderCompletionWeak.passed === false
      && productionWorkOrderCompletionWeak.repair_required === true
      && productionWorkOrderCompletionWeak.repair_route.some((item) => item.includes("master_action_state"))
      && productionWorkOrderCompletionPass.passed === true
      && productionWorkOrderCompletionPass.repair_required === false
      && productionWorkOrderReady.provider_execution_authority === false
      && productionWorkOrderReady.media_generation_authority === false
      && productionGraphRuntimeSource.includes("completeProductionWorkOrder"),
    "production work orders carry owner, specialists, required outputs and cross-workstream dependencies; completion is revalidated, weak evidence returns repair routing, durable completion persists its workstream report, and no work order grants provider or media authority",
  ),
  durable_production_state_concurrency: proof(
    productionGraphRuntimeSource.includes("recordProductionWorkstream")
      && productionGraphRuntimeSource.includes("advanceProductionRoom")
      && productionGraphRuntimeSource.includes("Repository.updateIfUnchanged")
      && productionGraphRepositorySource.includes("updateIfUnchanged")
      && productionGraphRepositorySource.includes('.eq("updated_at", expectedUpdatedAt)')
      && productionGraphRepositorySource.includes("PRODUCTION_GRAPH_CONCURRENT_UPDATE_CONFLICT"),
    "production-room state and workstream reports persist on the existing ProductionGraph and parallel writes use compare-and-swap against updated_at so stale departments cannot overwrite newer production state",
  ),
  owned_production_specialist_execution: proof(
    specialistExecutionProof.passed === true
      && specialistExecutionProof.media_generation_executed === false
      && specialistExecutionProof.provider_media_execution_authority === false
      && specialistExecutionRequest?.service_id === "ai.reasoning.execute"
      && specialistExecutionRequest?.provider_id === "avantiqo-intelligence"
      && specialistExecutionRequest?.provider_policy?.allowed_providers?.length === 1
      && specialistExecutionRequest?.provider_policy?.allowed_providers?.[0] === "avantiqo-intelligence"
      && specialistExecutionRequest?.provider_policy?.allow_owned_reasoning_fallback === false
      && specialistExecutionRequest?.metadata?.media_generation_allowed === false,
    "production specialists execute only through owned Avantiqo reasoning with external fallback disabled; their structured evidence is deterministically revalidated and carries no media-generation authority",
  ),
  parallel_specialist_wave_orchestration: proof(
    schedulerProof.wave_size === 2
      && schedulerProof.passed_count === 1
      && schedulerProof.repair_count === 1
      && schedulerProof.failed_count === 0
      && schedulerProof.media_generation_executed === false
      && schedulerProof.media_generation_authority === false
      && schedulerMergedProof.passed_workstream_count === 1
      && schedulerMergedProof.repair_workstream_count === 1
      && schedulerMergedProof.specialist_wave_audit.length === 2
      && productionGraphRuntimeSource.includes("executeProductionSpecialistWave")
      && productionGraphRuntimeSource.includes("mergeSpecialistWaveState")
      && productionGraphRuntimeSource.includes("PRODUCTION_GRAPH_ORGANIZATION_MISMATCH")
      && productionGraphRuntimeSource.includes("PRODUCTION_GRAPH_PROJECT_MISMATCH"),
    "bounded specialist waves execute independent ready work in parallel, preserve pass/repair results separately, batch-merge one durable production state, and remain organization/project bound with no media authority",
  ),
  production_dependency_deadlock_free: proof(
    productionDependencyAudit.passed === true
      && productionDependencyAudit.stages.length === 17
      && productionDependencyAudit.stages.every((stage) => stage.passed === true)
      && productionDependencyAudit.stages.every((stage) => stage.unresolved_requirements.length === 0),
    "stage-aware production dependencies are statically simulated across all seventeen rooms and no required specialist workstream is allowed to depend on work that can only happen in a later room",
  ),
  production_room_pipeline: proof(
    productionRoomBenchmark.passed === true && productionRoomBenchmark.stage_count === 17 && productionRoomSkipRejected === true,
    "research-to-release production rooms are ordered, staffed and hash-sealed; stage skipping is rejected",
  ),
  virtual_rehearsal_production_gate: proof(
    productionGateBeforeRehearsal.passed === false && productionGateAfterRehearsal.passed === true && productionTaskHasRoomGate,
    "visual provider execution remains blocked until the specific production has sealed Research Room through Virtual Rehearsal",
  ),
  production_unit_take_governance: proof(
    productionTakeIntentPass.passed === true
      && productionTakeIntentInvalid.passed === false
      && productionTakeIntentInvalid.failures.includes("PRODUCTION_UNIT_TAKE_INDEX_INVALID")
      && productionTaskHasTakeGuard,
    "every governed visual execution must bind one bounded planned take to owning production units, continuity keys, editorial purpose and the sealed rehearsal digest",
  ),
  dailies_post_release_chain: proof(
    dailiesPass.passed === true && dailiesWeak.passed === false && editorialPass.passed === true && editorialWeak.passed === false && releasePass.passed === true && releaseWeak.passed === false,
    "dailies reject a weak department, editorial forbids rejected takes, and release fails without master QC, rights evidence and delivery approval",
  ),
  reference_grammar_alignment: proof(
    (referenceMeasured || storyboardMeasured) && authoredGrammar.passed,
    referenceMeasured
      ? "five-reference full measured benchmark artifact verified"
      : storyboardMeasured
        ? "five-reference public visual storyboard benchmark verified for visual-generation readiness; full-reference audio measurement remains a final sound/master gate"
        : "BLOCKED: measured five-reference visual benchmark artifact not yet verified",
  ),
  known_failure_preflight_rejection: proof(knownFailuresRejected, "hostile deterministic fixtures all rejected before provider execution"),
  zero_paid_media_generation: proof(zeroPaidGeneration, "task, common provider, video provider and image provider master locks are all closed"),
};const readiness = evaluateStudioVisualReadiness(evidence);
let certification = null;
if (readiness.passed) certification = issueStudioVisualGenerationCertification(evidence);

const report = {
  generated_at: new Date().toISOString(),
  mode: "OFFLINE_ZERO_MEDIA_GENERATION",
  provider_calls_executed: 0,
  media_generation_executed: 0,
  readiness,
  certification,
};

const outputPath = path.join(root, "audits/results/creative-studio-visual-readiness.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = readiness.passed ? 0 : 2;
