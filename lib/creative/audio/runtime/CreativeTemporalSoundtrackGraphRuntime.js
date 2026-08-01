import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import {
  createProductionNode,
} from "@/lib/creative/production-graph/documents/ProductionGraph";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.temporal-soundtrack-graph.v1",
);

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

function workflowKind(input = {}, graph = {}) {
  return text(
    input.creative_plan?.workflow_kind ||
    graph.metadata?.workflow_kind,
  ).toUpperCase();
}

function explicitPrimaryAudio(plan = {}) {
  return text(
    plan.production?.primary_audio_asset_id ||
    plan.production?.primary_audio_asset_node_id ||
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

function soundtrackPrompt(plan = {}, duration = 0) {
  const concept = object(plan.concept);
  const story = object(plan.story);
  const musicWorld = object(plan.music_world);
  return [
    `Create an original ${duration}-second instrumental editorial soundtrack for a premium commercial film.`,
    `Creative thesis: ${text(concept.creative_thesis || concept.message)}.`,
    `Narrative arc: ${text(story.emotional_arc || concept.narrative)}.`,
    musicWorld.tempo_character
      ? `Tempo and groove direction: ${text(musicWorld.tempo_character)}; ${text(musicWorld.groove)}.`
      : "Begin with immediate curiosity, build confident social energy, create one memorable lift, and resolve with a restrained premium finish.",
    "The music must support dialogue, venue ambience, action-synchronised effects and editorial transitions without masking them.",
    "No vocals, spoken words, imitation of an existing artist, recognisable copyrighted melody, stock-music cliches, trailer braams, or generic corporate uplift.",
    "Deliver one continuous exact-duration stereo master with a clean opening, intentional internal dynamics, and a decisive ending without truncation or looping.",
  ].filter(Boolean).join(" ");
}

function soundtrackNode(input = {}, duration = 0) {
  const plan = object(input.creative_plan);
  const prompt = soundtrackPrompt(plan, duration);
  return createProductionNode({
    id: `master-soundtrack-${input.creative_project_id}`,
    type: "MASTER_SOUNDTRACK",
    title: "Original editorial master soundtrack",
    description: "Generate the exact-duration original score used by the final Churchill film mix.",
    duration_seconds: duration,
    priority: 20,
    intent: {
      purpose: "Carry the full emotional and editorial arc while leaving space for authentic venue sound.",
      emotion: plan.story?.emotional_arc || plan.concept?.emotional_promise || "",
      duration_seconds: duration,
    },
    requirements: {
      output_spec: {
        duration_seconds: duration,
        exact_duration_required: true,
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
      human_approval_required: false,
    },
    generation: {
      required: true,
      service: "ai.music.generate",
      capability: "ai.music.generate",
      provider: null,
      provider_prompt: prompt,
      provider_parameters: {
        duration_seconds: duration,
        instrumental: true,
      },
      output_spec: {
        duration_seconds: duration,
        exact_duration_required: true,
        format: "wav",
        sample_rate: 48000,
        channels: 2,
        instrumental: true,
      },
      estimated_cost: 0,
      estimated_seconds: duration,
      status: "WAITING",
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
          "CREATIVE_TEMPORAL_EDITORIAL_SOUNDTRACK_V1",
        temporal_soundtrack_node_id: node.id,
        temporal_soundtrack_duration_seconds: duration,
        temporal_soundtrack_exact_duration_required: true,
      },
    });
  };
}

install();

export const CreativeTemporalSoundtrackGraphRuntime = {
  installed: true,
};
