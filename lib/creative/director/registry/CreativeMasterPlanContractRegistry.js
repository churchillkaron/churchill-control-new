import {
  CreativeWorkflowRegistry,
} from "@/lib/creative/director/registry/CreativeWorkflowRegistry";

const CONTRACT = "CREATIVE_MASTER_PLAN_DECISION_CONTRACT_V2";

const DIRECTION_REVIEW_DIMENSIONS = Object.freeze([
  "strategic_specificity",
  "originality",
  "ownability",
  "audience_truth",
  "brand_truth",
  "medium_fitness",
  "craft_specificity",
  "factual_discipline",
  "language_specificity",
  "production_feasibility",
  "finishing_readiness",
]);

const COMMON_CONTRACT = Object.freeze({
  workflow_kind:
    "Choose exactly one registered workflow from the available workflow registry. If the mission does not constrain a medium, choose the workflow that best solves the business objective.",
  concept: Object.freeze({
    title: "Specific original working title.",
    creative_thesis:
      "Single governing creative idea with a clear point of view, tension and business relevance.",
    hook: "Specific first audience-facing idea or experience.",
    message: "What the audience should understand, feel, believe or do.",
    narrative: "Causal explanation of how the idea unfolds for this medium.",
    creative_system:
      "Medium-appropriate system of art direction, interaction, sound, language, structure, typography, motion or other craft decisions. Do not default to a visual or cinematic system when the workflow does not require one.",
    emotional_promise: "Specific emotional or experiential outcome.",
    call_to_action: "Earned action, or an explicit explanation that no CTA is appropriate.",
    target_audience: "Evidence-based audience definition. Never invent a generic target market.",
  }),
  creative_review: Object.freeze({
    passed:
      "True only when the returned direction is strong enough to proceed to production planning after internal rejection of weaker approaches.",
    overall_score: "0-100 accountable direction score.",
    dimensions:
      `Object containing 0-100 scores for every required dimension: ${DIRECTION_REVIEW_DIMENSIONS.join(", ")}.`,
    selected_direction_reason:
      "Why this single direction wins strategically and creatively for this organization, mission, audience and evidence.",
    rejected_patterns:
      "At least three predictable, generic, derivative or context-inappropriate approaches deliberately rejected before selection.",
    weakest_link:
      "The single weakest remaining aspect of the selected direction, stated precisely rather than defended.",
    craft_risks:
      "Concrete medium-specific craft failures that could make the final work look generic, synthetic, confusing, derivative or unfinished.",
    finishing_requirements:
      "Concrete final-craft requirements needed to make the work release-ready rather than merely generated or technically complete.",
    repair_before_production:
      "Any remaining repair required before production. Empty only when the plan genuinely needs no direction-level repair.",
  }),
  deliverables: Object.freeze({
    id: "Stable deliverable id.",
    type:
      "Precise deliverable type decided from the mission and intended use. Do not select from a canned category template.",
    purpose: "Role this deliverable plays in solving the mission.",
    channels:
      "Only explicitly required or organization-connected channels relevant to this deliverable. Empty is valid before release routing.",
    languages: "Only languages supported by mission or organization evidence.",
    output_spec:
      "Concrete executable specification derived from intended delivery context. Never use silent format, duration, aspect-ratio, resolution, frame-rate, language or channel defaults.",
    production_steps:
      "For UNIVERSAL executors, an explicit ordered capability plan. Every step must define id, title, purpose, service, capability, depends_on as a JSON array, output_spec, requirements as a JSON object and quality_gate as a JSON boolean. Every service/capability pair must come from context.available_production_capabilities. Provider names, prompts and provider parameters are forbidden here.",
  }),
  asset_manifest: Object.freeze({
    asset_id: "Exact supplied asset id.",
    disposition: "ASSIGNED | REFERENCE | REGENERATE | EXCLUDE.",
    reason: "Evidence-based production decision.",
    confidence: "0-100 confidence based on actual asset evidence.",
    assignments:
      "Exact deliverable, scene or shot ids. May be empty only when disposition is EXCLUDE.",
    restrictions: "Rights, consent, identity, brand and transformation restrictions.",
    continuity_anchors: "Exact elements that must remain stable.",
    repair_requirements: "Bounded repairs that preserve verified source truth.",
  }),
  production: Object.freeze({
    currency:
      "Organization/project currency when money is involved; null when no monetary decision exists. Never invent a currency.",
    cost_approval_required:
      "Boolean derived from actual governed spend requirements.",
    cost_approved:
      "Boolean reflecting actual approval state; never infer approval.",
    cross_deliverable_steps:
      "Optional workflow-level capability steps that depend on finished deliverables, such as coherence, integration or system-level quality. Every step uses the same canonical production-step shape including depends_on arrays and boolean quality_gate. Every service/capability pair must come from context.available_production_capabilities. Provider prompts are forbidden.",
  }),
  role_decisions:
    "Decision record for every registered agency role. Each role must explicitly be ACTIVE or NOT_REQUIRED. Every role whose registry applies_to contains ALL or the selected workflow_kind must be ACTIVE; only non-applicable roles may be NOT_REQUIRED. Active roles require concrete decision, evidence, confidence, risks and repair instructions.",
  quality:
    "Copy the supplied quality policy exactly. Do not invent or lower thresholds.",
});

const TEMPORAL_SCHEMA = Object.freeze({
  story: Object.freeze({
    hook: "Specific first story beat.",
    audience_tension: "Desire, contradiction, obstacle or unanswered question.",
    escalation: "How pressure, discovery or emotional stakes increase.",
    observable_proof: "What the audience sees or hears that proves the message.",
    turn: "Surprise, reversal, revelation or emotional consequence.",
    resolution: "Earned resolution caused by prior action.",
    call_to_action: "Action integrated into the resolution, or explicit no-CTA reasoning.",
    emotional_arc: "Precise emotional progression.",
    anti_cliche_strategy: "Specific strategy for avoiding predictable visual/story language.",
  }),
  scenes: Object.freeze({
    id: "Stable unique scene id.",
    title: "Specific scene title.",
    objective: "Unique causal story purpose.",
    emotion: "Specific audience emotion.",
    story_state_before: "What is true before this scene.",
    state_change: "New information, action or emotional change.",
    story_state_after: "What is now true because of the scene.",
    transition_logic: "Why the next scene follows.",
    duration_seconds: "Explicit positive duration from mission/project timing evidence.",
    location: "Specific environment, time/light state and spatial geography.",
    actors: "Evidence-backed people/characters only.",
    products: "Evidence-backed products/objects only.",
    brand_rules: "Applicable exact brand rules.",
    visual_style: "Specific composition, palette, material and texture behavior.",
    camera_style: "Specific camera grammar and movement rule.",
    audio_style: "Specific ambience, music/silence and sound-design role.",
    shots: "Ordered executable shots following the shot schema.",
  }),
  shot: Object.freeze({
    id: "Stable unique shot id.",
    title: "Specific shot title.",
    purpose: "New story information delivered by this shot.",
    subject: "Exact visible subject.",
    action: "Exact visible action over time.",
    performance: "Micro-behavior, timing and emotional behavior.",
    duration_seconds: "Explicit positive duration.",
    medium: "Structured production medium chosen for this shot.",
    frame_plan:
      "Opening composition/state, beat-by-beat visible progression and closing changed state.",
    camera:
      "Framing, angle, distance, optical intent, movement path/speed, stabilization, motivation and focus behavior.",
    lighting:
      "Motivated source, direction/falloff, contrast, color-temperature/palette intent and exposure treatment.",
    production_design:
      "Environment, wardrobe/grooming where relevant, props, material behavior and micro-texture detail.",
    continuity:
      "Identity, product, location, wardrobe, screen direction and spatial geography anchors.",
    dialogue: "Evidence-backed dialogue only.",
    narration: "Structured narration contract when required.",
    audio: "Source sound, effects, music/silence and mix hierarchy.",
    graphics: "Titles, subtitles, logo and overlays; exact text/logos remain outside generated pixels when fidelity matters.",
    vfx: "Effects, cleanup and compositing requirements.",
    transition_in: "Specific editorial transition into the shot.",
    transition_out: "Specific editorial transition out of the shot.",
    primary_source_asset_id:
      "Exact source asset id when source-bearing; null only when genuinely source-free.",
    reference_assets:
      "Typed exact reference asset bindings with evidence-based role and reason.",
    negative_constraints: "Specific failures that must not occur.",
    known_failure_modes: "Specific likely production/generation failures to inspect.",
    repair_instructions: "Bounded repair actions preserving approved story and source truth.",
    generation:
      "Structured required/service/capability/output_spec only. service/capability must come from context.available_production_capabilities. Provider prompt and provider parameters are forbidden.",
  }),
});

const WORKFLOW_CONTRACTS = Object.freeze({
  TEMPORAL: Object.freeze({
    executor_contract: "TEMPORAL_SPECIALIST",
    required_sections: Object.freeze(["story", "scenes"]),
    structured_schema: TEMPORAL_SCHEMA,
    craft_contract: Object.freeze({
      story:
        "Every scene and shot must cause a real state change; montage, filler and repeated beauty beats are not story progression.",
      scenes:
        "Each scene must have its own causal job and transition because of what happened before it.",
      shots:
        "Every shot must be executable, source-aware, physically coherent and worthy of inspection as a final commercial frame sequence.",
      delivery:
        "Duration and all technical output specifications must be explicit and internally consistent. No default aspect ratio, resolution or frame rate is permitted.",
    }),
  }),
  STILL: Object.freeze({
    executor_contract: "UNIVERSAL_CAPABILITY_GRAPH",
    required_sections: Object.freeze(["deliverables", "production"]),
    craft_contract: Object.freeze({
      composition: "Hierarchy, focal logic, visual tension, negative space, rhythm and crop behavior.",
      image_direction:
        "Source treatment, photography/illustration/generation/compositing decisions and exact-asset fidelity.",
      typography:
        "Type hierarchy, copy placement, legibility, spacing and exact rendering outside generated pixels when fidelity matters.",
      finishing:
        "Retouching, material realism, edges, reflections, anatomy/geometry, color treatment, output preparation and final artifact inspection.",
    }),
  }),
  DOCUMENT: Object.freeze({
    executor_contract: "UNIVERSAL_CAPABILITY_GRAPH",
    required_sections: Object.freeze(["deliverables", "production"]),
    craft_contract: Object.freeze({
      information_architecture: "Audience flow, hierarchy, sections and evidence requirements.",
      content_system: "Factual copy, data, captions, labels, tables and visual evidence.",
      editorial_design: "Grid, typography, pacing, imagery, whitespace and page/screen hierarchy.",
      output_integrity: "Accessibility, pagination, links, export fitness and factual validation.",
    }),
  }),
  INTERACTIVE: Object.freeze({
    executor_contract: "UNIVERSAL_CAPABILITY_GRAPH",
    required_sections: Object.freeze(["deliverables", "production"]),
    craft_contract: Object.freeze({
      experience_architecture: "User journeys, information architecture and conversion or task logic.",
      interaction_system: "States, transitions, feedback, responsive behavior and accessibility.",
      content_system: "Copy, media assignments, calls to action and content contracts.",
      implementation_quality: "Runtime behavior, performance, accessibility, security and release verification.",
    }),
  }),
  SOFTWARE: Object.freeze({
    executor_contract: "UNIVERSAL_CAPABILITY_GRAPH",
    required_sections: Object.freeze(["deliverables", "production"]),
    craft_contract: Object.freeze({
      product_definition: "User problem, jobs, requirements and success criteria.",
      system_design: "Components, state, data contracts, permissions, integrations and failure handling.",
      interface_system: "Interaction, accessibility, responsive behavior and product coherence.",
      verification: "Correctness, security, performance, tests and deployment evidence.",
    }),
  }),
  AUDIO: Object.freeze({
    executor_contract: "UNIVERSAL_CAPABILITY_GRAPH",
    required_sections: Object.freeze(["deliverables", "production"]),
    craft_contract: Object.freeze({
      structure: "Temporal structure, pacing, transitions and silence.",
      performance: "Voice, pronunciation, acting, musical performance or source-audio requirements.",
      sound_world: "Music, ambience, sound design, dynamics, spatial intent and mix hierarchy.",
      finishing: "Editing, cleanup, loudness, mastering, intelligibility and delivery validation.",
    }),
  }),
  CAMPAIGN_SYSTEM: Object.freeze({
    executor_contract: "UNIVERSAL_CAPABILITY_GRAPH",
    required_sections: Object.freeze(["deliverables", "production"]),
    craft_contract: Object.freeze({
      master_idea: "One governing campaign proposition rather than disconnected assets.",
      channel_roles:
        "Each channel/deliverable has a deliberate role derived from actual organization channel context, not a static channel list.",
      adaptation_system:
        "Rules for preserving the idea while adapting copy, pacing, format, interaction and production craft.",
      coherence:
        "At least one production.cross_deliverable_steps quality gate must evaluate the complete system before release.",
    }),
  }),
});

const GLOBAL_RULES = Object.freeze([
  "Business and creative decisions must come from mission, organization, research, brand, audience, assets, approved history, connected-channel context and verified evidence. Descriptive business classifications may inform research but may never select a canned creative template.",
  "Do not choose a medium, channel, style, duration, aspect ratio, resolution, frame rate, language, provider, budget currency or production technique merely because it is common for a category.",
  "Every production service and capability must be present in context.available_production_capabilities. If the required capability is unavailable, identify the capability gap and fail closed instead of inventing a service or provider.",
  "If the mission does not specify a deliverable, choose the deliverable system that best solves the objective and record the reasoning in concrete role decisions and production structure.",
  "Reject adjective-only direction. Words such as premium, professional, cinematic, natural, luxury, authentic, bold or elegant are not direction unless translated into exact craft decisions appropriate to the mission.",
  "Reject generic category-language, unsupported superlatives and copy that could be transferred unchanged to another organization. Language must emerge from the actual proposition and evidence.",
  "Every selected asset must appear exactly once in asset_manifest with a deliberate disposition. ASSIGNED, REFERENCE and REGENERATE assets require an explicit assignment; EXCLUDE assets remain accounted for without a production assignment.",
  "Every agency role whose registry applies_to contains ALL or the selected workflow_kind must be ACTIVE with concrete ownership evidence; NOT_REQUIRED is valid only for non-applicable roles.",
  "For UNIVERSAL_CAPABILITY_GRAPH production steps, depends_on is the only dependency field and must be a JSON array; quality_gate must be the JSON boolean true or false, never descriptive text.",
  "Exact identity, product, logo, venue, document and brand assets must remain source-faithful when the mission or rights evidence requires fidelity.",
  "Do not persist prompt, provider_prompt, negative_prompt, visual_prompt, video_prompt or provider_parameters anywhere in the plan. Provider transport serialization happens only at the governed execution boundary.",
  "For every UNIVERSAL_CAPABILITY_GRAPH workflow, every deliverable must contain explicit production_steps; no downstream planner is allowed to invent a creative workflow or default production recipe.",
  "Every deliverable must include at least one explicit quality-gate step appropriate to that deliverable unless the TEMPORAL specialist contract supplies its own quality graph.",
  "Do not copy protected campaigns, characters or a living artist's identity/style. Build original work from the organization's own truth and the mission's strategic opportunity.",
  "The system is accountable for the recommendation. Internally explore credible alternatives, reject weak and predictable work, and return one primary direction. Do not make the owner solve a menu of weak options.",
  "Before returning the plan, complete creative_review. Identify the weakest link, predictable approaches rejected, craft risks and finishing requirements. A direction that cannot criticize itself precisely must not pass.",
]);

export function getCreativeWorkflowContract(workflowKind) {
  const workflow = CreativeWorkflowRegistry.require(workflowKind);
  const contract = WORKFLOW_CONTRACTS[workflow.workflow_kind];
  if (!contract) {
    throw new Error(
      `CREATIVE_MASTER_PLAN_WORKFLOW_CONTRACT_MISSING:${workflow.workflow_kind}`,
    );
  }
  return {
    workflow_kind: workflow.workflow_kind,
    executor: workflow.executor,
    finaliser: workflow.finaliser,
    ...contract,
  };
}

export function buildCreativeMasterPlanDecisionContract() {
  const workflows = CreativeWorkflowRegistry.list().map((workflow) => ({
    workflow_kind: workflow.workflow_kind,
    aliases: [...workflow.aliases],
    executor: workflow.executor,
    contract: getCreativeWorkflowContract(workflow.workflow_kind),
  }));

  return {
    contract: CONTRACT,
    common_plan_contract: COMMON_CONTRACT,
    direction_review_dimensions: [...DIRECTION_REVIEW_DIMENSIONS],
    workflow_contracts: workflows,
    global_rules: [...GLOBAL_RULES],
  };
}

export const CreativeMasterPlanContractRegistry = Object.freeze({
  contract: CONTRACT,
  direction_review_dimensions: DIRECTION_REVIEW_DIMENSIONS,
  buildDecisionContract: buildCreativeMasterPlanDecisionContract,
  getWorkflowContract: getCreativeWorkflowContract,
});