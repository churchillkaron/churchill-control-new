import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import {
  createProductionNode,
} from "@/lib/creative/production-graph/documents/ProductionGraph";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.temporal-soundtrack-graph.v2",
);

const PROMPT_FIELDS = new Set([
  "prompt",
  "provider_prompt",
  "visual_prompt",
  "video_prompt",
  "negative_prompt",
  "instruction",
  "instructions",
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stripPromptFields(value) {
  if (Array.isArray(value)) return value.map(stripPromptFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PROMPT_FIELDS.has(key.toLowerCase()))
      .map(([key, entry]) => [key, stripPromptFields(entry)]),
  );
}

function workflowKind(input = {}, graph = {}) {
  return text(
    input.creative_plan?.workflow_kind ||
    graph.metadata?.workflow_kind,
  ).toUpperCase();
}

function explicitPrimaryAudio(plan = {}) {
  return text(
    plan.performance_context?.primary_audio_asset_id ||
    plan.performance_context?.primary_audio?.asset_id ||
    plan.production?.primary_audio_asset_id ||
    plan.production?.primary_audio_asset_node_id ||
    plan.audio?.primary_asset_id ||
    list(plan.deliverables)[0]?.output_spec?.primary_audio_asset_id,
  );
}

function soundtrackDisabled(plan = {}) {
  return plan.production?.audio_required === false &&
    plan.production?.generate_editorial_soundtrack === false;
}

function hasAudioGenerationNode(graph = {}) {
  return list(graph.nodes).some((node) => {
    const capability = text(
      node.generation?.capability ||
      node.generation?.service,
    ).toLowerCase();
    return capability.includes("music") ||
      capability.includes("audio") ||
      capability.includes("sfx") ||
      capability.includes("voice");
  });
}

function masterDuration(input = {}) {
  const plan = object(input.creative_plan);
  const deliverable = object(list(plan.deliverables)[0]);
  const output = object(deliverable.output_spec);
  const explicit = finite(
    output.duration_seconds ??
    plan.temporal_contract?.duration_seconds,
  );
  if (explicit && explicit > 0) return explicit;
  const sceneTotal = list(input.scenes).reduce(
    (sum, scene) => sum + Math.max(0, finite(scene.duration_seconds) || 0),
    0,
  );
  if (sceneTotal > 0) return sceneTotal;
  throw new Error("CREATIVE_TEMPORAL_SOUNDTRACK_DURATION_REQUIRED");
}

function soundtrackSpecification(plan = {}, duration = 0) {
  const concept = object(plan.concept);
  const story = object(plan.story);
  const explicitSpecification = stripPromptFields(object(
    plan.soundtrack_specification ||
    plan.audio?.soundtrack_specification ||
    plan.production?.soundtrack_specification,
  ));
  const musicWorld = stripPromptFields(object(plan.music_world));
  const mixSpecification = stripPromptFields(object(
    plan.audio_mix ||
    plan.audio?.mix_specification ||
    plan.production?.audio_mix,
  ));
  const creativeThesis = text(
    explicitSpecification.creative_thesis ||
    concept.creative_thesis ||
    concept.message,
  );
  const narrativeArc = text(
    explicitSpecification.narrative_arc ||
    story.emotional_arc ||
    concept.narrative,
  );
  const hasApprovedDirection = Boolean(
    creativeThesis ||
    narrativeArc ||
    Object.keys(explicitSpecification).length ||
    Object.keys(musicWorld).length,
  );
  const blockingIssues = hasApprovedDirection
    ? []
    : ["APPROVED_SOUNDTRACK_DIRECTION_REQUIRED"];

  return {
    contract: "CREATIVE_TEMPORAL_SOUNDTRACK_SPECIFICATION_V2",
    source_of_truth: "APPROVED_STRUCTURED_CREATIVE_PLAN",
    duration_seconds: duration,
    exact_duration_required: true,
    creative_thesis: creativeThesis || null,
    narrative_arc: narrativeArc || null,
    music_world: musicWorld,
    mix_specification: mixSpecification,
    explicit_specification: explicitSpecification,
    output_specification: {
      format: "wav",
      sample_rate: 48000,
      channels: 2,
      instrumental: true,
      render_role: "EDITORIAL_SOUNDTRACK",
      include_in_master: true,
    },
    rights_requirements: {
      original_composition_required: true,
      commercial_usage_required: true,
      protected_style_imitation_prohibited: true,
    },
    promptless_execution: true,
    stored_prompt_generated: false,
    fixed_music_template_used: false,
    fixed_business_vocabulary_used: false,
    organization_specific_copy_used: false,
    provider_selected: false,
    provider_spend_approved: false,
    provider_calls_executed: false,
    blocking_issues: blockingIssues,
    passed: blockingIssues.length === 0,
  };
}

function soundtrackNode(input = {}, duration = 0) {
  const plan = object(input.creative_plan);
  const specification = soundtrackSpecification(plan, duration);
  return createProductionNode({
    id: `master-soundtrack-${input.creative_project_id}`,
    type: "MASTER_SOUNDTRACK",
    title: "Original master soundtrack",
    description:
      "Create the exact-duration soundtrack defined by the approved structured specification.",
    duration_seconds: duration,
    priority: 20,
    intent: {
      purpose: specification.creative_thesis,
      emotion: specification.narrative_arc,
      duration_seconds: duration,
    },
    requirements: {
      output_spec: specification.output_specification,
      rights_requirements: specification.rights_requirements,
      soundtrack_specification: specification,
      human_approval_required: true,
      dispatch_authorization_required: true,
    },
    generation: {
      required: specification.passed,
      service: "ai.music.generate",
      capability: "ai.music.generate",
      provider: null,
      provider_parameters: {
        duration_seconds: duration,
        instrumental: true,
        soundtrack_specification: specification,
      },
      output_spec: specification.output_specification,
      estimated_cost: null,
      estimated_seconds: duration,
      status: specification.passed ? "WAITING_APPROVAL" : "BLOCKED",
      dispatch_authorized: false,
      provider_selection_authorized: false,
      spend_authorized: false,
      promptless_execution: true,
    },
    metadata: {
      workflow_kind: "TEMPORAL",
      production_step_id: "soundtrack",
      audio_role: "music",
      render_role: "EDITORIAL_SOUNDTRACK",
      include_in_master: true,
      duration_seconds: duration,
      generated_editorial_soundtrack: true,
      exact_duration_required: true,
      release_candidate: true,
      soundtrack_specification_contract: specification.contract,
      soundtrack_specification_passed: specification.passed,
      soundtrack_blocking_issues: specification.blocking_issues,
      promptless_execution: true,
      stored_prompt_generated: false,
      organization_specific_copy_used: false,
      provider_calls_executed: false,
    },
  });
}

function install() {
  if (ProductionGraphRuntime[INSTALL_FLAG]) return;
  const planWithoutSoundtrack = ProductionGraphRuntime.plan.bind(
    ProductionGraphRuntime,
  );
  Object.defineProperty(ProductionGraphRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.plan = async function planWithTemporalSoundtrack(input = {}) {
    const graph = await planWithoutSoundtrack(input);
    const plan = object(input.creative_plan);
    if (workflowKind(input, graph) !== "TEMPORAL") return graph;
    if (explicitPrimaryAudio(plan)) return graph;
    if (soundtrackDisabled(plan)) return graph;
    if (hasAudioGenerationNode(graph)) return graph;

    const duration = masterDuration(input);
    const node = soundtrackNode(input, duration);
    return ProductionGraphRuntime.update(graph.id, {
      nodes: [...list(graph.nodes), node],
      metadata: {
        ...object(graph.metadata),
        temporal_soundtrack_contract:
          "CREATIVE_TEMPORAL_EDITORIAL_SOUNDTRACK_V2",
        temporal_soundtrack_node_id: node.id,
        temporal_soundtrack_duration_seconds: duration,
        temporal_soundtrack_exact_duration_required: true,
        temporal_soundtrack_promptless_execution: true,
        temporal_soundtrack_human_approval_required: true,
        temporal_soundtrack_provider_selected: false,
        temporal_soundtrack_provider_spend_approved: false,
        temporal_soundtrack_provider_calls_executed: false,
      },
    });
  };
}

install();

export const CreativeTemporalSoundtrackGraphRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_TEMPORAL_EDITORIAL_SOUNDTRACK_V2",
});
