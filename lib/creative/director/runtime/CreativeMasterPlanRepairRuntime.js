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

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback = null) {
  const number = finite(value, fallback);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function cleanId(value, fallback) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function detailed(value, fallback, minimum = 30) {
  const current = text(value);
  if (!current || /^(none|n\/a|null|slow|soft|medium|low|high|face)$/i.test(current)) {
    return fallback;
  }
  if (current.length >= minimum) return current;
  return `${current}. ${fallback}`;
}

function locationText(value) {
  if (typeof value === "string") return text(value);
  if (Array.isArray(value)) return value.map(locationText).filter(Boolean).join(", ");
  const source = object(value);
  return Object.entries(source)
    .map(([key, item]) => `${key}: ${text(item)}`)
    .filter((item) => !item.endsWith(": "))
    .join(", ");
}

function durationFrom({ plan = {}, project = {}, brief = {} } = {}) {
  const metadata = object(project.metadata);
  const deliverableDuration = list(plan.deliverables)
    .map((item) => positive(item?.output_spec?.duration_seconds, null))
    .find(Boolean);
  return positive(
    metadata.temporal_contract?.duration_seconds ??
    metadata.temporalContract?.duration_seconds ??
    metadata.full_master_duration ??
    metadata.full_song_duration_seconds ??
    metadata.creative_direction_constraints?.full_song_duration_seconds ??
    brief.duration_seconds ??
    project.target_duration ??
    deliverableDuration,
    null,
  );
}

function exactDurations(total, count) {
  const safeCount = Math.max(1, Math.floor(count));
  const milliseconds = Math.max(safeCount, Math.round(Number(total || 0) * 1000));
  const base = Math.floor(milliseconds / safeCount);
  const remainder = milliseconds - base * safeCount;
  return Array.from({ length: safeCount }, (_, index) =>
    Number(((base + (index < remainder ? 1 : 0)) / 1000).toFixed(3)),
  );
}

function phaseLabel(index, count) {
  if (count <= 1) return "complete beat";
  const ratio = index / Math.max(1, count - 1);
  if (ratio <= 0.2) return "establishing beat";
  if (ratio <= 0.45) return "developing beat";
  if (ratio <= 0.7) return "escalation beat";
  if (ratio < 1) return "consequence beat";
  return "transition beat";
}

function phaseInstruction(index, count) {
  const label = phaseLabel(index, count);
  if (label === "establishing beat") {
    return "Establish geography, emotional baseline and the first readable micro-action without spending the reveal too early";
  }
  if (label === "developing beat") {
    return "Advance the visible action through one new decision, reaction or spatial change while preserving identity and screen direction";
  }
  if (label === "escalation beat") {
    return "Increase emotional pressure through performance, camera proximity and a concrete change in the subject's behaviour";
  }
  if (label === "consequence beat") {
    return "Hold on the consequence of the prior action long enough for the audience to read it, then prepare the next visual idea";
  }
  if (label === "transition beat") {
    return "Resolve the scene's visual question and finish on a composition whose movement, eyeline or shape motivates the next scene";
  }
  return "Deliver one complete visible action with a readable beginning, development and consequence";
}

function defaultNegativePrompt() {
  return "Avoid identity drift, face substitution, extra fingers, malformed hands, rubber skin, waxy highlights, floating objects, unstable backgrounds, unreadable generated text, invented logos, camera teleportation, continuity jumps, excessive slow motion, generic stock-video posing and synthetic AI artefacts.";
}

function generationPrompt({ shot, scene, phase, duration }) {
  const camera = object(shot.camera);
  const lighting = object(shot.lighting);
  const design = object(shot.production_design);
  const framePlan = object(shot.frame_plan);
  return [
    `Create a ${duration.toFixed(3)}-second cinematic music-video shot for scene “${text(scene.title)}”.`,
    `Story purpose: ${text(shot.purpose)}.`,
    `Visible subject and action: ${text(shot.subject)}; ${text(shot.action)}.`,
    `Performance direction: ${text(shot.performance)}.`,
    `Temporal beat: ${phase}.`,
    `Opening frame: ${text(framePlan.opening_frame)}.`,
    `Progression: ${text(framePlan.progression)}.`,
    `Closing frame: ${text(framePlan.closing_frame)}.`,
    `Camera: ${text(camera.framing)}, ${text(camera.angle)}, ${text(camera.lens_intent)}, moving ${text(camera.movement_path)} at ${text(camera.movement_speed)} with ${text(camera.stabilization)}.`,
    `Lighting: ${text(lighting.source)}; ${text(lighting.direction)}; ${text(lighting.contrast)}; ${text(lighting.colour)}; ${text(lighting.exposure_intent)}.`,
    `Production design: ${text(design.environment)}; wardrobe ${text(design.wardrobe)}; props ${text(design.props)}; materials ${text(design.materials)}; texture ${text(design.texture_detail)}.`,
    "Preserve the supplied artist identity and reference assets exactly. Render no final titles, logos, subtitles or legal copy inside generated pixels.",
  ].join(" ");
}

function normalizeShot({
  source = {},
  scene = {},
  sceneIndex,
  shotIndex,
  phaseIndex,
  phaseCount,
  duration,
  keepSourceId = false,
} = {}) {
  const phase = phaseInstruction(phaseIndex, phaseCount);
  const sourceId = cleanId(source.id, `scene-${sceneIndex + 1}-source-shot`);
  const shotId = keepSourceId
    ? sourceId
    : `${sourceId}-beat-${String(phaseIndex + 1).padStart(2, "0")}`;
  const subject = detailed(
    source.subject,
    `Cole Ley remains the precise visual focus, with face, body proportions, hairstyle and wardrobe matched to the approved identity references`,
    12,
  );
  const action = detailed(
    source.action,
    `${phase}; the action must create a visible change from the opening state to the closing state rather than holding a static pose`,
    24,
  );
  const performance = detailed(
    source.performance || source.performance_direction,
    `Use restrained, emotionally truthful micro-performance: controlled breathing, specific eyeline, subtle facial tension and physically motivated timing appropriate to this ${phaseLabel(phaseIndex, phaseCount)}`,
    28,
  );
  const location = locationText(source.location) || locationText(scene.location) || "the established story location";
  const wardrobe = detailed(
    source.production_design?.wardrobe || source.wardrobe,
    "Preserve the exact approved wardrobe silhouette, fabric, accessories, grooming and continuity state from the adjacent shot",
    16,
  );
  const products = list(source.products).length ? source.products : list(scene.products);
  const productContinuity = products.length
    ? `Preserve the exact product identity, dimensions, label orientation, surface condition and hand relationship established in the reference assets`
    : "No commercial product is present in this shot; preserve that absence and do not invent branded objects, packaging or promotional props";

  const framePlan = object(source.frame_plan);
  const openingFrame = detailed(
    framePlan.opening_frame || source.opening_frame,
    `Open on a fully readable composition in ${location}, with ${subject} placed according to established screen direction and the emotional state from the previous beat still visible`,
    40,
  );
  const progression = detailed(
    framePlan.progression || source.progression || source.progression_frames,
    `${phase}. Progress continuously across the ${duration.toFixed(3)} seconds through one motivated action, one readable reaction and one camera adjustment; do not freeze, loop or jump between unrelated poses`,
    60,
  );
  const closingFrame = detailed(
    framePlan.closing_frame || source.closing_frame,
    `Finish on a stable, intentional composition that clearly shows the consequence of this beat and provides a matching shape, eyeline or motion vector for the following edit`,
    40,
  );

  const sourceCamera = object(source.camera);
  const camera = {
    ...sourceCamera,
    framing: detailed(sourceCamera.framing, "Purposeful medium-close framing that keeps performance readable while retaining enough environment for spatial continuity", 12),
    angle: detailed(sourceCamera.angle, "Eye-level angle with a deliberate slight offset that supports intimacy without glamourising the performance", 10),
    camera_distance: detailed(sourceCamera.camera_distance, "Maintain a consistent physical distance that preserves facial geometry and prevents perspective distortion", 12),
    lens_intent: detailed(sourceCamera.lens_intent, "Naturalistic perspective with gentle background separation and no exaggerated wide-angle facial distortion", 16),
    movement_path: detailed(sourceCamera.movement_path, "A single physically possible path that follows the subject's action and preserves established screen direction", 16),
    movement_speed: detailed(sourceCamera.movement_speed, "Slow, controlled movement with a gentle acceleration at the emotional turn and a settled stop before the cut", 12),
    stabilization: detailed(sourceCamera.stabilization, "Controlled dolly or gimbal movement with subtle human weight, no digital floating and no camera teleportation", 12),
    movement_motivation: detailed(sourceCamera.movement_motivation, "The camera moves only when the subject makes a decision or the emotional information changes", 16),
    focus_target: detailed(sourceCamera.focus_target, "Cole Ley's nearest eye and the precise facial micro-expression carrying this beat", 12),
    focus_transition: detailed(sourceCamera.focus_transition, "Hold critical facial focus, then perform one motivated rack only when story attention transfers to another subject or object", 16),
  };

  const sourceLighting = object(source.lighting);
  const lighting = {
    ...sourceLighting,
    source: detailed(sourceLighting.source, "A motivated practical or environmental key source that belongs naturally to the established location", 12),
    direction: detailed(sourceLighting.direction, "Shape the face from a consistent three-quarter direction with believable falloff into the environment", 12),
    contrast: detailed(sourceLighting.contrast, "Controlled cinematic contrast with protected skin detail, readable eyes and dense but non-crushed shadows", 12),
    colour: detailed(sourceLighting.colour, "A restrained colour-temperature relationship that follows the scene palette and protects natural skin colour", 12),
    exposure_intent: detailed(sourceLighting.exposure_intent, "Expose for believable skin and practical highlights while retaining texture in wardrobe, hair and shadow detail", 16),
  };

  const sourceDesign = object(source.production_design);
  const productionDesign = {
    ...sourceDesign,
    environment: detailed(sourceDesign.environment, `Maintain the established geography and dressed detail of ${location}; background elements must remain stable across the shot`, 16),
    wardrobe,
    props: detailed(sourceDesign.props || source.props, "Use only story-motivated props already established by the scene; otherwise keep the frame deliberately free of invented objects", 12),
    materials: detailed(sourceDesign.materials, "Preserve believable fabric, skin, hair, glass, metal and painted-surface response under the motivated lighting", 12),
    texture_detail: detailed(sourceDesign.texture_detail, "Retain pores, fine hair, fabric weave, fingerprints, dust and small environmental irregularities that prevent a synthetic finish", 16),
  };

  const sourceContinuity = object(source.continuity);
  const continuity = {
    ...sourceContinuity,
    identity: detailed(sourceContinuity.identity, "Lock Cole Ley's facial structure, age, hairline, skin detail, body proportions and distinctive features to the approved references", 16),
    product: detailed(sourceContinuity.product, productContinuity, 12),
    location: detailed(sourceContinuity.location, `Preserve ${location}, including background layout, practical light positions, weather, time of day and object placement`, 12),
    wardrobe: detailed(sourceContinuity.wardrobe, wardrobe, 12),
    screen_direction: detailed(sourceContinuity.screen_direction, "Maintain the established eyeline and left-to-right movement vector unless the shot explicitly motivates a reversal", 12),
    spatial_geography: detailed(sourceContinuity.spatial_geography, "Keep every subject, prop and camera position consistent with the prior beat so the audience can map the space", 12),
  };

  const sourceAudio = object(source.audio);
  const audio = {
    ...sourceAudio,
    source_sound: detailed(sourceAudio.source_sound, "Retain subtle location ambience and physically motivated cloth, breath and movement detail beneath the master song", 12),
    sound_effects: list(sourceAudio.sound_effects || source.sound_effects),
    music: {
      ...object(sourceAudio.music || source.music),
      role: "PRIMARY_SOUNDTRACK",
      preserve_full_song_timing: true,
    },
    silence: detailed(sourceAudio.silence, "Do not mute or replace the primary soundtrack; any designed silence must be achieved only through approved mix automation", 12),
    mix_intent: detailed(sourceAudio.mix_intent, "The uploaded song remains dominant and uncut; ambience and effects stay subtle, rhythmic and subordinate to vocal clarity", 20),
  };

  const generation = object(source.generation);
  const normalized = {
    ...source,
    id: shotId,
    title: detailed(source.title, `${text(scene.title) || `Scene ${sceneIndex + 1}`} — ${phaseLabel(phaseIndex, phaseCount)}`, 10),
    purpose: detailed(source.purpose, `${phase}; introduce one new visual fact or emotional consequence that advances the scene instead of repeating the previous image`, 28),
    subject,
    action,
    performance,
    duration_seconds: duration,
    medium: text(source.medium) || "generated-video",
    frame_plan: {
      ...framePlan,
      opening_frame: openingFrame,
      progression,
      closing_frame: closingFrame,
    },
    camera,
    lighting,
    production_design: productionDesign,
    continuity,
    audio,
    graphics: {
      titles: [],
      subtitles: [],
      logo: {},
      overlays: [],
      render_text_outside_generated_pixels: true,
      ...object(source.graphics),
    },
    vfx: {
      effects: [],
      cleanup: ["Remove temporal artefacts without altering identity, performance or camera intent"],
      compositing: [],
      ...object(source.vfx),
    },
    transition_in: detailed(source.transition_in, phaseIndex === 0 ? "Enter on a motivated cut from the prior scene's final motion or eyeline" : "Cut on matched movement, eyeline or rhythmic emphasis from the preceding beat", 12),
    transition_out: detailed(source.transition_out, phaseIndex === phaseCount - 1 ? "Exit on a resolved composition that motivates the next scene through shape, motion or emotional consequence" : "Cut at the completion of the beat's new action, preserving motion and screen direction into the next shot", 12),
    negative_constraints: list(source.negative_constraints).length
      ? source.negative_constraints
      : [
          "No identity drift or face substitution",
          "No malformed hands, duplicated limbs or unstable anatomy",
          "No generated typography, logos or invented branded objects",
          "No background morphing, camera teleportation or discontinuous screen direction",
          "No generic stock-video posing, excessive slow motion or synthetic beauty treatment",
        ],
    known_failure_modes: list(source.known_failure_modes).length
      ? source.known_failure_modes
      : [
          "facial identity drift during head movement",
          "hand deformation during contact or gesture",
          "background geometry changing between frames",
          "motion cadence becoming floaty or unnaturally slow",
        ],
    repair_instructions: list(source.repair_instructions).length
      ? source.repair_instructions
      : [
          "Repair only the failing temporal region; preserve approved identity, framing, timing and surrounding frames",
          "Use adjacent approved frames and reference assets as continuity anchors",
          "Do not rewrite the story action, camera path or song timing during repair",
        ],
    generation: {
      ...generation,
      required: generation.required !== false,
      service: text(generation.service) || "ai.video.generate",
      capability: text(generation.capability) || "ai.video.generate",
      provider_prompt: detailed(
        generation.provider_prompt || source.provider_prompt,
        generationPrompt({
          shot: {
            ...normalized,
            subject,
            action,
            performance,
            frame_plan: {
              opening_frame: openingFrame,
              progression,
              closing_frame: closingFrame,
            },
            camera,
            lighting,
            production_design: productionDesign,
          },
          scene,
          phase,
          duration,
        }),
        140,
      ),
      negative_prompt: detailed(generation.negative_prompt, defaultNegativePrompt(), 60),
      output_spec: {
        width: 1920,
        height: 1080,
        aspect_ratio: "16:9",
        fps: 24,
        format: "mp4",
        duration_seconds: duration,
        audio: false,
        render_text_outside_generated_pixels: true,
        preserve_identity: true,
        preserve_temporal_continuity: true,
        ...object(generation.output_spec || source.output_spec),
        duration_seconds: duration,
      },
    },
    metadata: {
      ...object(source.metadata),
      canonical_master_plan_repair: true,
      source_master_plan_shot_id: source.id || null,
      temporal_phase_index: phaseIndex,
      temporal_phase_count: phaseCount,
    },
  };

  return normalized;
}

function normalizedSceneDurations(scenes, targetDuration) {
  const current = scenes.map((scene) => positive(scene.duration_seconds, 0));
  const currentTotal = current.reduce((sum, value) => sum + value, 0);
  if (!targetDuration) {
    return current.map((value) => value || 5);
  }
  if (currentTotal <= 0) return exactDurations(targetDuration, scenes.length);

  const raw = current.map((value) => targetDuration * (value / currentTotal));
  const milliseconds = raw.map((value) => Math.max(1, Math.floor(value * 1000)));
  let remaining = Math.round(targetDuration * 1000) - milliseconds.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  while (remaining > 0) {
    milliseconds[cursor % milliseconds.length] += 1;
    cursor += 1;
    remaining -= 1;
  }
  while (remaining < 0) {
    const index = cursor % milliseconds.length;
    if (milliseconds[index] > 1) {
      milliseconds[index] -= 1;
      remaining += 1;
    }
    cursor += 1;
  }
  return milliseconds.map((value) => Number((value / 1000).toFixed(3)));
}

function normalizeScene(scene, sceneIndex, duration) {
  const sourceShots = list(scene.shots);
  const shots = sourceShots.length
    ? sourceShots
    : [{
        id: `${cleanId(scene.id, `scene-${sceneIndex + 1}`)}-source-shot`,
        title: scene.title,
        purpose: scene.objective,
        subject: list(scene.actors).map((actor) => actor?.name || actor?.role || actor).filter(Boolean).join(", ") || "Cole Ley",
        action: scene.state_change || scene.objective,
        performance: scene.emotion,
        duration_seconds: duration,
      }];

  const desiredCount = Math.max(
    shots.length,
    Math.ceil(duration / 5.5),
  );
  const durations = exactDurations(duration, desiredCount);
  const expanded = [];

  for (let index = 0; index < desiredCount; index += 1) {
    const sourceIndex = Math.min(
      shots.length - 1,
      Math.floor((index * shots.length) / desiredCount),
    );
    const source = shots[sourceIndex];
    expanded.push(normalizeShot({
      source,
      scene,
      sceneIndex,
      shotIndex: index,
      phaseIndex: index,
      phaseCount: desiredCount,
      duration: durations[index],
      keepSourceId: desiredCount === shots.length,
    }));
  }

  return {
    ...scene,
    id: cleanId(scene.id, `scene-${sceneIndex + 1}`),
    duration_seconds: duration,
    shots: expanded,
    metadata: {
      ...object(scene.metadata),
      canonical_master_plan_repair: true,
      repaired_shot_count: expanded.length,
    },
  };
}

export function repairCreativeMasterPlan({
  plan = {},
  project = {},
  brief = {},
  assets = [],
  quality_policy = {},
} = {}) {
  const source = object(plan);
  const workflowKind = text(source.workflow_kind).toUpperCase();
  if (workflowKind !== "TEMPORAL") {
    return {
      ...source,
      quality: { ...quality_policy },
    };
  }

  const duration = durationFrom({ plan: source, project, brief });
  const sourceScenes = list(source.scenes);
  const sceneDurations = normalizedSceneDurations(sourceScenes, duration);
  const scenes = sourceScenes.map((scene, index) =>
    normalizeScene(scene, index, sceneDurations[index]),
  );
  const repairedDuration = scenes.reduce(
    (sum, scene) => sum + Number(scene.duration_seconds || 0),
    0,
  );

  const deliverables = list(source.deliverables).map((deliverable, index) => ({
    ...deliverable,
    id: cleanId(deliverable.id, `deliverable-${index + 1}`),
    type: text(deliverable.type) || "VIDEO",
    purpose: detailed(deliverable.purpose, "Full-song master music video preserving the complete uploaded soundtrack and continuous visual story", 20),
    output_spec: {
      width: 1920,
      height: 1080,
      aspect_ratio: "16:9",
      fps: 24,
      format: "mp4",
      duration_seconds: duration || repairedDuration,
      preserve_full_song_audio: true,
      exact_duration_required: true,
      ...object(deliverable.output_spec),
      duration_seconds: duration || repairedDuration,
    },
  }));

  return {
    ...source,
    workflow_kind: "TEMPORAL",
    deliverables: deliverables.length
      ? deliverables
      : [{
          id: "full-song-master",
          type: "VIDEO",
          purpose: "Full-song master music video preserving the complete uploaded soundtrack and continuous visual story",
          channels: [],
          languages: [],
          output_spec: {
            width: 1920,
            height: 1080,
            aspect_ratio: "16:9",
            fps: 24,
            format: "mp4",
            duration_seconds: duration || repairedDuration,
            preserve_full_song_audio: true,
            exact_duration_required: true,
          },
        }],
    scenes,
    quality: { ...quality_policy },
    production_contract: {
      ...object(source.production_contract),
      exact_duration_seconds: duration || repairedDuration,
      maximum_generated_shot_duration_seconds: 5.5,
      required_minimum_shot_count: scenes.reduce(
        (sum, scene) => sum + list(scene.shots).length,
        0,
      ),
      primary_soundtrack_is_timing_authority: true,
      no_song_truncation: true,
      no_song_looping: true,
      no_time_compression: true,
    },
    metadata: {
      ...object(source.metadata),
      canonical_master_plan_repair: true,
      repair_version: "CREATIVE_MASTER_PLAN_REPAIR_V1",
      repaired_at: new Date().toISOString(),
      supplied_asset_count: list(assets).length,
    },
  };
}

export const CreativeMasterPlanRepairRuntime = {
  repair: repairCreativeMasterPlan,
};
