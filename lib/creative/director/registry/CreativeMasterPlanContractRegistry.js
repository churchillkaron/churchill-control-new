import {
  CreativeWorkflowRegistry,
} from "@/lib/creative/director/registry/CreativeWorkflowRegistry";

const CONTRACT = "CREATIVE_MASTER_PLAN_DECISION_CONTRACT_V1";

const COMMON_CONTRACT = Object.freeze({
  workflow_kind:
    "Choose exactly one registered workflow from the available workflow registry. If the mission does not constrain a medium, choose the workflow that best solves the business objective.",
  concept: Object.freeze({
    title: "Specific original working title.",
    creative_thesis:
      "Single governing creative idea with a clear point of view and business relevance.",
    hook: "Specific first audience-facing idea or experience.",
    message: "What the audience should understand, feel, believe or do.",
    narrative: "Causal explanation of how the idea unfolds for this medium.",
    creative_system:
      "Medium-appropriate system of art direction, interaction, sound, language, structure, typography, motion or other craft decisions. Do not default to a visual or cinematic system when the workflow does not require one.",
    emotional_promise: "Specific emotional or experiential outcome.",
    call_to_action: "Earned action, or an explicit explanation that no CTA is appropriate.",
    target_audience: "Evidence-based audience definition. Never invent a generic target market.",
  }),
  deliverables: Object.freeze({
    id: "Stable deliverable id.",
    type:
      "Precise deliverable type decided from the mission and intended use. Do not select from a canned industry template.",
    purpose: "Role this deliverable plays in solving the mission.",
    channels:
      "Only explicitly required or organization-connected channels relevant to this deliverable. Empty is valid before release routing.",
    languages: "Only languages supported by mission or organization evidence.",
    output_spec:
      "Concrete executable specification derived from intended delivery context. Never use silent format, duration, aspect-ratio, resolution, frame-rate, language or channel defaults.",
    production_steps:
      "For UNIVERSAL executors, an explicit ordered capability plan. Every step must define id, title, purpose, service, capability, dependencies, output_spec, requirements and quality_gate. Provider names, prompts and provider parameters are forbidden here.",
  }),
  asset_manifest: Object.freeze({
    asset_id: "Exact supplied asset id.",
    disposition: "ASSIGNED | REFERENCE | REGENERATE | EXCLUDE.",
    reason: "Evidence-based production decision.",
    confidence: "0-100 confidence based on actual asset evidence.",
    assignments: "Exact deliverable, scene or shot ids.",
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
      "Optional workflow-level capability steps that depend on finished deliverables, such as coherence, integration or system-level quality. Provider prompts are forbidden.",
  }),
  role_decisions:
    "Decision record for every registered agency role. Each role must explicitly be ACTIVE or NOT_REQUIRED; active roles require concrete decision, evidence, confidence, risks and repair instructions.",
  quality:
    "Copy the supplied quality policy exactly. Do not invent or lower thresholds.",
});

const WORKFLOW_CONTRACTS = Object.freeze({
  TEMPORAL: Object.freeze({
    executor_contract: "TEMPORAL_SPECIALIST",
    required_sections: Object.freeze(["story", "scenes"]),
    craft_contract: Object.freeze({
      story:
        "Hook, audience tension, escalation, observable proof, turn, resolution, CTA, emotional arc and anti-cliche strategy.",
      scenes:
        "Each scene must cause a distinct story-state change and contain executable shots.",
      shots:
        "Every shot must define purpose, subject, visible action over time, performance, duration, frame plan, camera, lighting, production design, continuity, audio, graphics, VFX, transitions, source bindings, negative constraints, known failure modes, bounded repair instructions and structured generation output specification.",
      delivery:
        "Temporal duration and technical output specifications must be explicit and internally consistent. No default aspect ratio, resolution or frame rate is permitted.",
    }),
  }),
  STILL: Object.freeze({
    executor_contract: "UNIVERSAL_CAPABILITY_GRAPH",
    required_sections: Object.freeze(["deliverables", "production"]),
    craft_contract: Object.freeze({
      composition: "Hierarchy, focal logic, negative space, rhythm and crop behavior.",
      image_direction:
        "Source treatment, photography/illustration/generation/compositing decisions and exact-asset fidelity.",
      typography:
        "Type hierarchy, copy placement, legibility and rule that final typography/logos/legal text are rendered outside generated pixels when fidelity matters.",
      finishing:
        "Retouching, material realism, artifact inspection, color treatment, output preparation and quality review.",
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
        "Each channel/deliverable has a deliberate role derived from actual organization channel context, not a static social list.",
      adaptation_system:
        "Rules for preserving the idea while adapting copy, pacing, format, interaction and production craft.",
      coherence:
        "At least one production.cross_deliverable_steps quality gate must evaluate the complete system before release.",
    }),
  }),
});

const GLOBAL_RULES = Object.freeze([
  "Business and creative decisions must come from mission, organization, research, brand, audience, assets, approved history, connected-channel context and verified evidence. Industry labels may inform research but may never select a canned creative template.",
  "Do not choose a medium, channel, style, duration, aspect ratio, resolution, frame rate, language, provider, budget currency or production technique merely because it is common for a category.",
  "If the mission does not specify a deliverable, choose the deliverable system that best solves the objective and record the reasoning in concrete role decisions and production structure.",
  "Reject generic premium, professional, cinematic, natural, luxury, authentic or similar adjective-only direction unless the specific execution choices that make it true are defined.",
  "Every selected asset must appear exactly once in asset_manifest with a deliberate disposition and assignment.",
  "Exact identity, product, logo, venue, document and brand assets must remain source-faithful when the mission or rights evidence requires fidelity.",
  "Do not persist prompt, provider_prompt, negative_prompt, visual_prompt, video_prompt or provider_parameters anywhere in the plan. Provider transport serialization happens only at the governed execution boundary.",
  "For every UNIVERSAL_CAPABILITY_GRAPH workflow, every deliverable must contain explicit production_steps; no downstream planner is allowed to invent a creative workflow or default production recipe.",
  "Every deliverable must include at least one explicit quality-gate step appropriate to that deliverable unless the TEMPORAL specialist contract supplies its own quality graph.",
  "Do not copy protected campaigns, characters or a living artist's identity/style. Build original work from the organization's own truth and the mission's strategic opportunity.",
  "The system is accountable for the recommendation. Do not return a menu of weak alternatives for the owner to solve. Produce a clear primary direction that has already survived internal criticism.",
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
    workflow_contracts: workflows,
    global_rules: [...GLOBAL_RULES],
  };
}

export const CreativeMasterPlanContractRegistry = Object.freeze({
  contract: CONTRACT,
  buildDecisionContract: buildCreativeMasterPlanDecisionContract,
  getWorkflowContract: getCreativeWorkflowContract,
});
