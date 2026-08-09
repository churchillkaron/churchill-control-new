import crypto from "node:crypto";

import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";

const FLAG = Symbol.for(
  "avantiqo.creative.temporal-soundtrack-cue-sheet.v1",
);
const CONTRACT = "CREATIVE_TEMPORAL_SOUNDTRACK_CUE_SHEET_V1";

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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function workflowKind(input = {}, graph = {}) {
  return text(
    input.creative_plan?.workflow_kind ||
    graph.metadata?.workflow_kind,
  ).toUpperCase();
}

function shotDuration(shot = {}) {
  const value = finite(shot.duration_seconds);
  return value && value > 0 ? value : 0;
}

function stringList(value) {
  return list(value)
    .flatMap((entry) => {
      if (typeof entry === "string") return [text(entry)];
      if (!entry || typeof entry !== "object") return [];
      return [text(
        entry.name ||
        entry.type ||
        entry.effect ||
        entry.description ||
        entry.action ||
        entry.cue,
      )];
    })
    .filter(Boolean);
}

function musicDirection(shot = {}) {
  const source = object(
    Object.keys(object(shot.music)).length
      ? shot.music
      : shot.audio?.music,
  );
  return {
    role: text(source.role || source.purpose || source.function) || null,
    intensity: text(
      source.intensity ||
      source.energy ||
      source.dynamic ||
      source.dynamics,
    ) || null,
    texture: text(
      source.texture ||
      source.instrumentation ||
      source.arrangement ||
      source.character,
    ) || null,
    rhythm: text(
      source.rhythm ||
      source.pulse ||
      source.tempo_relationship ||
      source.tempo,
    ) || null,
    transition: text(
      source.transition ||
      source.entry ||
      source.exit ||
      source.change,
    ) || null,
  };
}

function shotCue({ scene, shot, sceneIndex, shotIndex, startSeconds }) {
  const audio = object(shot.audio);
  const soundDesign = object(shot.sound_design);
  const duration = shotDuration(shot);
  const endSeconds = startSeconds + duration;
  const silence = text(audio.silence || soundDesign.silence) || null;
  const sourceSound = text(
    audio.source_sound ||
    soundDesign.source_sound ||
    soundDesign.ambience,
  ) || null;
  const soundEffects = [
    ...stringList(shot.sound_effects),
    ...stringList(audio.sound_effects),
    ...stringList(soundDesign.sound_effects),
    ...stringList(soundDesign.effects),
  ];
  const mixIntent = text(
    audio.mix_intent ||
    soundDesign.mix_intent ||
    soundDesign.mix,
  ) || null;

  return {
    cue_id: `${text(scene.id) || `scene-${sceneIndex + 1}`}:${text(shot.id) || `shot-${shotIndex + 1}`}`,
    scene_id: scene.id || null,
    shot_id: shot.id || null,
    timeline_in_seconds: Number(startSeconds.toFixed(3)),
    timeline_out_seconds: Number(endSeconds.toFixed(3)),
    duration_seconds: Number(duration.toFixed(3)),
    story_purpose: text(shot.purpose || scene.objective) || null,
    emotion: text(shot.emotion || scene.emotion) || null,
    music: musicDirection(shot),
    ambience: sourceSound,
    sound_effects: [...new Set(soundEffects)],
    silence,
    mix_intent: mixIntent,
    transition_in: shot.transition_in || null,
    transition_out: shot.transition_out || null,
    preserve_dialogue_intelligibility:
      list(shot.dialogue).length > 0 || Boolean(text(shot.narration?.text || shot.narration)),
  };
}

function cueSheet(input = {}) {
  const plan = object(input.creative_plan);
  const scenes = list(input.scenes).length
    ? list(input.scenes)
    : list(plan.scenes);
  const cues = [];
  let cursor = 0;

  scenes.forEach((scene, sceneIndex) => {
    const shots = list(scene.shots);
    shots.forEach((shot, shotIndex) => {
      const cue = shotCue({
        scene,
        shot,
        sceneIndex,
        shotIndex,
        startSeconds: cursor,
      });
      cues.push(cue);
      cursor = cue.timeline_out_seconds;
    });
  });

  const masterDuration = finite(
    list(plan.deliverables)[0]?.output_spec?.duration_seconds ??
    plan.temporal_contract?.duration_seconds,
  );
  if (!masterDuration || masterDuration <= 0) {
    throw new Error("CREATIVE_SOUNDTRACK_CUE_SHEET_MASTER_DURATION_REQUIRED");
  }
  if (!cues.length) {
    throw new Error("CREATIVE_SOUNDTRACK_CUE_SHEET_SHOTS_REQUIRED");
  }
  if (Math.abs(cursor - masterDuration) > 0.05) {
    throw new Error(
      `CREATIVE_SOUNDTRACK_CUE_SHEET_DURATION_MISMATCH:${cursor}:${masterDuration}`,
    );
  }

  const sheet = {
    contract: CONTRACT,
    source_of_truth: "APPROVED_STRUCTURED_SHOT_DIRECTION",
    duration_seconds: masterDuration,
    exact_duration_required: true,
    cue_count: cues.length,
    cues,
    mix_governance: {
      soundtrack_generated_from_complete_cue_sheet: true,
      ambience_and_effects_must_be_authored_into_master: true,
      intentional_silence_must_be_authored_into_master: true,
      dialogue_and_narration_take_priority_when_present: true,
      post_approval_music_replacement_prohibited: true,
      post_approval_audio_level_automation_prohibited: true,
      provider_added_music_after_approval_prohibited: true,
      source_clip_audio_after_approval_prohibited: true,
    },
    promptless_execution: true,
    provider_selected: false,
    provider_calls_executed: false,
  };
  return {
    ...sheet,
    cue_sheet_hash: hash(sheet),
  };
}

function masterSoundtrackNode(graph = {}) {
  return list(graph.nodes).find((node) =>
    text(node.type).toUpperCase() === "MASTER_SOUNDTRACK" ||
    text(node.metadata?.production_step_id).toLowerCase() === "soundtrack",
  ) || null;
}

function install() {
  if (ProductionGraphRuntime[FLAG]) return;
  const planWithoutCueSheet = ProductionGraphRuntime.plan.bind(
    ProductionGraphRuntime,
  );
  Object.defineProperty(ProductionGraphRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.plan = async function planWithSoundtrackCueSheet(input = {}) {
    const graph = await planWithoutCueSheet(input);
    if (workflowKind(input, graph) !== "TEMPORAL") return graph;

    const soundtrack = masterSoundtrackNode(graph);
    if (!soundtrack || soundtrack.generation?.required !== true) return graph;

    const sheet = cueSheet(input);
    const nodes = list(graph.nodes).map((node) => {
      if (node.id !== soundtrack.id) return node;
      const requirements = object(node.requirements);
      const generation = object(node.generation);
      const parameters = object(generation.provider_parameters);
      const specification = object(requirements.soundtrack_specification);
      return {
        ...node,
        requirements: {
          ...requirements,
          soundtrack_specification: {
            ...specification,
            director_cue_sheet: sheet,
            director_cue_sheet_hash: sheet.cue_sheet_hash,
            sound_design_embedded_before_approval: true,
          },
          director_cue_sheet: sheet,
          director_cue_sheet_hash: sheet.cue_sheet_hash,
        },
        generation: {
          ...generation,
          provider_parameters: {
            ...parameters,
            soundtrack_specification: {
              ...object(parameters.soundtrack_specification),
              director_cue_sheet: sheet,
              director_cue_sheet_hash: sheet.cue_sheet_hash,
            },
            director_cue_sheet: sheet,
            director_cue_sheet_hash: sheet.cue_sheet_hash,
          },
        },
        metadata: {
          ...object(node.metadata),
          soundtrack_cue_sheet_contract: CONTRACT,
          soundtrack_cue_sheet_hash: sheet.cue_sheet_hash,
          soundtrack_cue_count: sheet.cue_count,
          sound_design_embedded_before_approval: true,
          post_approval_audio_mutation_prohibited: true,
        },
      };
    });

    return ProductionGraphRuntime.update(graph.id, {
      nodes,
      metadata: {
        ...object(graph.metadata),
        soundtrack_cue_sheet_contract: CONTRACT,
        soundtrack_cue_sheet_hash: sheet.cue_sheet_hash,
        soundtrack_cue_count: sheet.cue_count,
        soundtrack_sound_design_embedded_before_approval: true,
        soundtrack_post_approval_audio_mutation_prohibited: true,
      },
    });
  };
}

install();

export const CreativeTemporalSoundtrackCueSheetRuntime = Object.freeze({
  installed: true,
  contract: CONTRACT,
  build: cueSheet,
});
