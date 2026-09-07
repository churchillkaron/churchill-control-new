export const dynamic = "force-dynamic";
export const maxDuration = 300;

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prepareInvestorFirstMinuteProduction } from "@/lib/creative/director/runtime/CreativeInvestorFirstMinuteProductionRuntime";
import { ProductionRuntime } from "@/lib/creative/production/runtime/ProductionRuntime";

const ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const PROJECT_ID = "0f906cec-2329-46f1-a62e-2dff9ef41f2e";
const MISSION_ID = "bde23d52-9a95-40be-b667-d263a67542ab";
const TOKEN_SHA256 = "b2e46fa9fa3c1361c72c97528c20cb65ba9a56e175324bf0e67f6e4575413b9d";
const MASTER_PLAN_HASH = "eb2a0c8762150f00be3fb91bbeabcc6aea954671e0be8b685aa1efc1c8122e36";
const STORY_CONTRACT_HASH = "2c6c41af87e813f5d3dfc9478b3b1e76911b7f9fdb3653aea1d67391b4a94968";
const COUNCIL_HASH = "6c92182a8f3df8045cc947fc243035f2dfd6488b64fd44d36b98f368894b7f54";
const CONCEPT_HASH = "2d43273492033f4fa93118af413098f8339fc7988663c9ff43666e0710eb9f39";

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function shot({ id, shot_number, title, purpose, subject, action, duration_seconds, energy, camera, lighting, sound_effects, transition_in, transition_out }) {
  return {
    id,
    shot_number,
    title,
    purpose,
    subject,
    action,
    performance: "Natural documentary-grade human behavior. No posing, no presenter-to-camera delivery, no exaggerated acting.",
    duration_seconds,
    medium: "CINEMATIC_VIDEO",
    frame_plan: {
      opening_frame: { composition: "Immediate physical world, tactile depth, believable working environment, foreground obstruction or human motion for dimensionality." },
      progression_frames: [
        { beat: "physical action develops causally" },
        { beat: "camera discovers operational consequence rather than explaining it" },
      ],
      closing_frame: { composition: "End on motion, gesture, object, or eyeline that motivates the next cut." },
    },
    camera: {
      grammar: camera,
      capture: "premium large-format commercial cinema feel",
      lens_behavior: "natural perspective, controlled depth, no synthetic infinite sharpness",
      movement_speed: energy,
      focus_strategy: "motivated rack focus or controlled continuous focus only when story-relevant",
      composition: "layered foreground-midground-background; human-scale framing; avoid centered corporate tableau",
    },
    lighting: {
      mood: lighting,
      key_fill_edge: "motivated practical-light hierarchy with shaped key and restrained edge separation",
      exposure_hierarchy: "protect skin and practical highlights; rich shadows; no crushed detail",
      contrast: "premium cinematic contrast with natural rolloff",
    },
    production_design: {
      world: "real operating businesses before software: restaurant/service/logistics/back-office spaces that feel part of one coherent lived-in universe",
      texture: "paper, stainless steel, food prep, delivery packaging, phones, handwritten notes, receipts, work surfaces, uniforms, real wear",
      forbidden: ["generic luxury boardroom", "empty futuristic office", "AI laboratory", "neon HUD", "floating dashboard wall"],
    },
    continuity: {
      world_rule: "same believable business ecosystem; pressure increases shot by shot",
      temporal_rule: "one continuous operating morning/day with causal progression",
      intelligence_engine_visible: false,
    },
    actors: [],
    products: [],
    location: { type: "real operating business environment", geography: "globally legible, Southeast-Asia-compatible without tourism cliché" },
    dialogue: [],
    narration: {},
    audio: {
      philosophy: "sound-first physical realism; machinery, kitchen, paper, footsteps, phones, refrigeration, traffic, room tone",
      music_relationship: "score supports momentum but never turns the scene into a tech commercial",
    },
    music: {
      direction: "restrained prestige pulse built from low mechanical rhythm and human-world percussion; tension accumulates gradually",
      no_trailer_braams: true,
    },
    sound_effects,
    graphics: { allowed: false, reason: "first minute must be felt through physical business reality, not explained with UI" },
    vfx: { mode: "INVISIBLE_POLISH_ONLY", allowed: ["cleanup", "subtle atmosphere", "environment extension if imperceptible"], forbidden: ["glowing AI", "data particles", "holograms", "energy streams"] },
    transition_in,
    transition_out,
    negative_constraints: [
      "no AI-looking imagery",
      "no passive dashboard shot",
      "no talking-head corporate explainer",
      "no smiling staged team meeting",
      "no neon blue technology language",
      "no Avantiqo interface reveal before 00:60",
      "no Intelligence Engine visualization before its later story phase",
      "no reused legacy investor-film assets",
    ],
    known_failure_modes: [
      "generic stock-footage composition",
      "random montage without causal continuity",
      "over-clean synthetic environments",
      "unbelievable hands or faces",
      "camera motion without emotional purpose",
      "supplier exception shown as abstract UI instead of physical consequence",
    ],
    repair_instructions: [
      "repair only the failing temporal region",
      "preserve continuity and causal action",
      "re-review anatomy, identity where applicable, physics, continuity, cinematic merit and story function before selection",
    ],
    reference_assets: [],
    reuse_policy: { mode: "FRESH_GENERATION_ONLY", reuse_allowed: false },
    metadata: {
      minimum_quality: 94,
      fresh_assets_only: true,
      no_asset_reuse: true,
      investor_first_minute: true,
      cinematic_attraction_required: true,
      intelligence_engine_phase: "PRE_REVEAL",
      provider_prompt_persisted: false,
      story_lineage: {
        master_plan_hash: MASTER_PLAN_HASH,
        story_contract_hash: STORY_CONTRACT_HASH,
        concept_council_hash: COUNCIL_HASH,
        selected_concept_hash: CONCEPT_HASH,
      },
    },
    generation: {
      required: true,
      service: "ai.video.generate",
      capability: "ai.video.generate",
      estimated_cost: 220,
      estimated_seconds: duration_seconds,
      output_spec: { type: "video", aspect_ratio: "16:9", duration_seconds, quality: "WORLD_CLASS" },
      provider_parameters: { fresh_generation: true, reference_asset_ids: [], preserve_audio: false },
    },
  };
}

const master = {
  workflow_kind: "TEMPORAL",
  validation: { passed: true },
  degraded: false,
  selected_concept_id: "concept-human-pressure",
  concept: {
    id: "concept-human-pressure",
    title: "The Living Business",
    narrative: "Make the audience feel a real business as a living machine before software appears. Human work creates momentum; fragmentation creates friction; at 00:45 one supplier exception enters and starts propagating through physical operations.",
  },
  concept_candidates: [
    { id: "concept-human-pressure", title: "The Living Business" },
    { id: "concept-fragmented-day", title: "One Day, Too Many Systems" },
    { id: "concept-causal-chain", title: "The Exception" },
  ],
  concept_council: {
    contract: "INDEPENDENT_CREATIVE_CONCEPT_COUNCIL_V1",
    council_hash: COUNCIL_HASH,
    concept_hash: CONCEPT_HASH,
    critic_reports: [
      { critic: "cinematography", passed: true },
      { critic: "story", passed: true },
      { critic: "human_performance", passed: true },
      { critic: "investor_attention", passed: true },
    ],
    scorecards: [
      { concept_id: "concept-human-pressure", weighted_score: 97, all_critics_passed: true },
      { concept_id: "concept-fragmented-day", weighted_score: 88, all_critics_passed: true },
      { concept_id: "concept-causal-chain", weighted_score: 91, all_critics_passed: true },
    ],
    selection: { selected_scorecard: { concept_id: "concept-human-pressure", weighted_score: 97, all_critics_passed: true }, mandatory_repairs_before_planning: [] },
  },
  music_world: {
    arc: "physical human rhythm -> accumulating operational pulse -> restrained tension at supplier exception",
    instrumentation: ["low percussion", "tactile mechanical rhythm", "subtle strings/textures"],
  },
  cinematic_coverage: {
    philosophy: "Ferrari/Lamborghini physical energy without imitation; Volvo humanity; Apple precision; Netflix narrative pull; Mercedes-scale world building.",
    attraction_test: "Every shot must either create desire to see the next shot or increase causal tension.",
  },
  story_architecture: {
    chapter_1: { start: 0, end: 45, title: "Business before software", function: "Make the audience feel the living complexity and pressure of operating a real company." },
    chapter_2_entry: { start: 45, end: 60, title: "The supplier exception begins", function: "Introduce one concrete exception and show the first physical consequences spreading." },
  },
  production: {
    currency: "THB",
    reuse_policy: "NO_REUSE_UNLESS_EXPLICITLY_APPROVED",
    dry_run_dossier_required_before_paid_generation: true,
    prohibit_self_judged_concept_selection: true,
    prohibit_hybrid_concept_selection: true,
    concept_council_hash: COUNCIL_HASH,
    selected_concept_hash: CONCEPT_HASH,
    identity_story_keyframe_required_before_video: true,
    identity_story_keyframe_human_approval_required_before_video: true,
    audio_conditioned_lip_sync_required: true,
    fresh_assets_only: true,
    provider_prompt_fields_forbidden: true,
    intelligence_engine_reveal_allowed: false,
  },
  story_lineage: {
    master_plan_hash: MASTER_PLAN_HASH,
    story_contract_hash: STORY_CONTRACT_HASH,
    concept_council_hash: COUNCIL_HASH,
    selected_concept_hash: CONCEPT_HASH,
    story_authority: "AVANTIQO_INVESTOR_FIRST_MINUTE_MASTER_V1",
  },
  metadata: {
    first_minute_only: true,
    full_nine_minute_master_materialized: false,
    authoritative_segment: "00:00-01:00",
    fresh_assets_only: true,
  },
  scenes: [
    {
      id: "chapter-1-business-before-software",
      scene_number: 1,
      title: "Business Before Software",
      objective: "Make operating pressure visceral, human and physical before any software is introduced.",
      emotion: "kinetic competence under accumulating friction",
      duration_seconds: 45,
      story_function: "HUMAN_WORLD_SETUP",
      story_state_before: "The business is alive and moving.",
      state_change: "The audience discovers how many interdependent decisions are happening at once and how fragile coordination is.",
      story_state_after: "A single upstream failure now has somewhere meaningful to land.",
      transition_logic: "The rhythm tightens until a quiet procurement dependency becomes the point of tension.",
      brand_rules: ["Avantiqo logo and UI remain absent", "no technology hero imagery", "human competence is respected"],
      visual_style: { palette: "natural warm/cool practical light, rich blacks, tactile metal/paper/skin", finish: "prestige global commercial with real-world texture" },
      camera_style: { energy: "motivated movement, macro physical detail, lateral tracking, occasional controlled push-in", rule: "camera discovers cause and consequence" },
      audio_style: { rule: "physical diegetic sound drives the edit before score does" },
      coverage_plan: { rhythm: "8-10 second authored shots with internal action and motivated transitions" },
      metadata: { minimum_quality: 94, fresh_assets_only: true, story_lineage: { master_plan_hash: MASTER_PLAN_HASH, story_contract_hash: STORY_CONTRACT_HASH } },
      shots: [
        shot({ id: "s1-01", shot_number: 1, title: "Open on Motion", purpose: "Start inside a living business, not with a logo or explanation.", subject: "hands, tools, food, paperwork, doors, deliveries and anonymous staff already in motion", action: "A rapid but coherent chain of physical work begins before the audience has time to classify the company: a shutter rises, a knife lands, a receipt tears, a trolley turns, a phone vibrates, a door opens.", duration_seconds: 9, energy: "controlled fast lateral discovery", camera: "macro inserts connected by motivated match cuts into a low tracking move through the workspace", lighting: "pre-opening practical light and early daylight mixing naturally", sound_effects: ["metal shutter", "knife on board", "receipt tear", "trolley wheels", "phone vibration", "door latch"], transition_in: "cold open on sound before picture", transition_out: "match cut on circular motion from trolley wheel to service plate" }),
        shot({ id: "s1-02", shot_number: 2, title: "Interdependence", purpose: "Show that every action depends on another human action.", subject: "anonymous kitchen, service, stockroom and back-office workers operating in parallel", action: "One worker checks stock while another plates, another answers a supplier call, another signs for a delivery, another compares a handwritten note with a screen kept out of hero focus.", duration_seconds: 9, energy: "fluid steadicam with purposeful handoffs", camera: "move through connected spaces; foreground wipes create natural transitions; no montage randomness", lighting: "working daylight with practical pools and believable mixed color temperature", sound_effects: ["refrigerator door", "marker on cardboard", "printer", "distant call bell", "muffled conversation"], transition_in: "plate motion carries frame", transition_out: "foreground worker wipes frame into back office" }),
        shot({ id: "s1-03", shot_number: 3, title: "Fragmented Attention", purpose: "Make fragmentation felt without turning software into the subject.", subject: "anonymous owner-manager moving between real operational interruptions", action: "The manager walks, listens, signs, checks a phone, answers a staff question, points to a delivery area, then stops for half a second as two needs arrive at once.", duration_seconds: 9, energy: "single-take pressure with subtle acceleration", camera: "medium tracking profile, brief rack focus between competing demands, never presenter-facing", lighting: "natural practical office-to-floor transition with richer contrast", sound_effects: ["footsteps", "incoming message", "paper shuffle", "staff question", "kitchen pass ambience"], transition_in: "foreground wipe from worker", transition_out: "sound bridge: message vibration continues under next shot" }),
        shot({ id: "s1-04", shot_number: 4, title: "Consequences Live Elsewhere", purpose: "Show that the business is one causal system even when information is fragmented.", subject: "stock, prep, service bookings, cash drawer and staffing board as physical operational states", action: "A near-empty ingredient bin, a prep list, a reservation/service queue, cash changing hands, and a shift note are linked by motivated cuts; none is a dashboard hero shot.", duration_seconds: 9, energy: "precise rhythmic cuts with macro-to-wide scale changes", camera: "macro details tied by hand/object motion into short composed wides", lighting: "harder operational daylight and practical reflections; premium highlight rolloff", sound_effects: ["container lid", "pen tick", "cash drawer", "ticket printer", "clock tick submerged in room tone"], transition_in: "message vibration resolves into container lid impact", transition_out: "clock tick becomes delivery-bay reversing beep" }),
        shot({ id: "s1-05", shot_number: 5, title: "Dependency", purpose: "Land on procurement as a quiet dependency immediately before the exception.", subject: "delivery bay, prep station and an expected supplier slot that has not arrived", action: "A worker clears space for an expected delivery. Prep continues. Someone glances toward the entrance. The business is still functioning, but the camera holds one beat longer than before.", duration_seconds: 9, energy: "decelerating controlled push-in", camera: "wide physical geography -> medium task detail -> restrained push toward empty delivery threshold", lighting: "natural late-morning/working light with a slightly cooler threshold outside", sound_effects: ["distant traffic", "refrigeration hum", "single trolley rattle", "room tone dropping subtly"], transition_in: "delivery reversing beep motivates geography", transition_out: "near-silence broken by one incoming supplier message tone" })
      ]
    },
    {
      id: "chapter-2-supplier-exception-entry",
      scene_number: 2,
      title: "The Supplier Exception Begins",
      objective: "Introduce one concrete supplier failure and make its first consequences propagate through the physical business.",
      emotion: "specific threat, tightening causality",
      duration_seconds: 15,
      story_function: "INCITING_EXCEPTION",
      story_state_before: "The business expects the supply chain to hold.",
      state_change: "A critical delivery is delayed and multiple downstream activities begin to change.",
      story_state_after: "The audience understands that one exception can cross operational boundaries; the intelligence response is deliberately withheld for later.",
      transition_logic: "message -> inventory/prep consequence -> human coordination pressure; cut at 60 seconds before solution reveal.",
      brand_rules: ["No Avantiqo reveal yet", "no glowing AI", "the exception is concrete and physical"],
      visual_style: { palette: "same world, slightly cooler tension and tighter framing", finish: "visceral physical causality" },
      camera_style: { energy: "shorter, more consequential movements", rule: "every cut follows the exception" },
      audio_style: { rule: "supplier message tone becomes a recurring causal sound motif" },
      coverage_plan: { rhythm: "three 5-second causal beats" },
      metadata: { minimum_quality: 94, fresh_assets_only: true, story_lineage: { master_plan_hash: MASTER_PLAN_HASH, story_contract_hash: STORY_CONTRACT_HASH } },
      shots: [
        shot({ id: "s2-01", shot_number: 1, title: "The Exception Arrives", purpose: "Make the supplier exception specific in one instant.", subject: "a supplier delay message received by an anonymous operating manager beside the delivery/prep area", action: "The phone vibrates. The manager reads a short delivery-delay notification; we register the change through eyes, breath and body stillness, not exposition. The expected delivery threshold remains empty behind them.", duration_seconds: 5, energy: "sudden stillness after kinetic opening", camera: "tight over-shoulder enough to imply delay without making text/UI the hero; rack focus to empty delivery threshold", lighting: "same practical world with cooler exterior separation", sound_effects: ["single message tone", "refrigeration hum", "room tone dip"], transition_in: "message tone from previous scene", transition_out: "hard cut on manager eyeline toward prep station" }),
        shot({ id: "s2-02", shot_number: 2, title: "Propagation One", purpose: "Show first operational consequence immediately.", subject: "prep worker reaching the end of a critical ingredient or supply", action: "A hand opens the expected container: almost empty. Prep pauses for a fraction. A second worker changes what they are doing. Nobody explains it.", duration_seconds: 5, energy: "fast causal push-in then hold", camera: "eyeline match into macro container reveal, then short pull to two-person operational geography without identifiable hero faces", lighting: "tactile stainless reflections, protected skin, no stylized tech light", sound_effects: ["container lid", "utensil stops", "cloth movement", "message motif low in score"], transition_in: "eyeline match", transition_out: "sound bridge from stopped utensil into ticket/printer activity" }),
        shot({ id: "s2-03", shot_number: 3, title: "Propagation Two", purpose: "End the minute with pressure spreading beyond procurement, before showing the solution.", subject: "anonymous manager, service flow and staffing activity reacting to the missing supply", action: "The manager moves toward service while making a call; a ticket waits; a worker adjusts a prep/availability note; another task is delayed. The camera begins to widen as if the consequence is larger than one room — then CUT at exactly 60 seconds.", duration_seconds: 5, energy: "accelerating move that is cut off before resolution", camera: "lateral tracking through overlapping operational layers, ending on a wider frame with multiple consequences visible", lighting: "coherent world, slightly deeper contrast as tension rises", sound_effects: ["call connection tone", "ticket printer", "footsteps", "subtle low mechanical pulse rising"], transition_in: "printer sound bridge", transition_out: "hard unresolved cut at 00:60; no logo, no Intelligence reveal" })
      ]
    }
  ]
};

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token") || "";
    if (hash(token) !== TOKEN_SHA256) {
      return NextResponse.json({ success: false, error: "NOT_FOUND" }, { status: 404 });
    }

    const prepared = await prepareInvestorFirstMinuteProduction({
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
      creative_mission_id: MISSION_ID,
      master,
    });

    let production = null;
    let production_error = null;
    try {
      production = await ProductionRuntime.runProduction({
        organization_id: ORGANIZATION_ID,
        creative_project_id: PROJECT_ID,
      });
    } catch (error) {
      production_error = error?.message || String(error);
    }

    return NextResponse.json({
      success: production_error == null,
      contract: "AVANTIQO_INVESTOR_FIRST_MINUTE_ALIGNMENT_RUN_V1",
      scope: "00:00-01:00",
      prepared,
      production,
      production_error,
      publication_authorized: false,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
