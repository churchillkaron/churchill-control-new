import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const PATCH_FLAG = Symbol.for(
  "avantiqo.creative.direction.execution-repair.v1",
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

function positive(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  const source = text(value).replace(/^\uFEFF/, "");
  if (!source) return null;
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed.result || parsed;
      }
    } catch {
      // Continue.
    }
  }
  return null;
}

function id(value, fallback) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function detailed(value, fallback, minimum) {
  const current = text(value);
  if (
    !current ||
    /^(none|n\/a|null|slow|soft|medium|low|high|face|medium soft)$/i.test(current)
  ) {
    return fallback;
  }
  if (current.length >= minimum) return current;
  return `${current}. ${fallback}`;
}

function exactDurations(totalSeconds, count) {
  const safeCount = Math.max(1, Math.floor(count));
  const totalMilliseconds = Math.max(
    safeCount,
    Math.round(Number(totalSeconds || 0) * 1000),
  );
  const base = Math.floor(totalMilliseconds / safeCount);
  const remainder = totalMilliseconds - base * safeCount;
  return Array.from({ length: safeCount }, (_, index) =>
    Number(((base + (index < remainder ? 1 : 0)) / 1000).toFixed(3)),
  );
}

function locationDescription(scene = {}, shot = {}) {
  const source = Object.keys(object(shot.location)).length
    ? shot.location
    : scene.location;
  if (typeof source === "string") return text(source);
  return Object.entries(object(source))
    .map(([key, value]) => `${key}: ${text(value)}`)
    .filter((entry) => !entry.endsWith(": "))
    .join(", ") || "the established story location";
}

function beatInstruction(index, count) {
  const ratio = count <= 1 ? 1 : index / (count - 1);
  if (ratio <= 0.2) {
    return "Establish geography, emotional baseline and the first readable micro-action without spending the scene's reveal too early";
  }
  if (ratio <= 0.45) {
    return "Advance the visible action through one new decision, reaction or spatial change while preserving identity, wardrobe and screen direction";
  }
  if (ratio <= 0.7) {
    return "Escalate emotional pressure through specific performance, camera proximity and a concrete change in the subject's behaviour";
  }
  if (ratio < 1) {
    return "Hold the consequence of the prior action long enough to be understood, then prepare the scene's final visual turn";
  }
  return "Resolve the scene's visual question and finish on a composition whose movement, shape or eyeline motivates the next scene";
}

function negativePrompt() {
  return "Avoid identity drift, face substitution, extra fingers, malformed hands, duplicated limbs, rubber skin, waxy highlights, unstable backgrounds, floating objects, camera teleportation, discontinuous screen direction, unreadable generated text, invented logos, generic stock-video posing, excessive slow motion and visible synthetic AI artefacts.";
}

function providerPrompt({ scene, shot, duration, beat }) {
  return [
    `Generate a ${duration.toFixed(3)}-second cinematic music-video shot for scene “${text(scene.title)}”.`,
    `Story purpose: ${text(shot.purpose)}.`,
    `Subject: ${text(shot.subject)}.`,
    `Visible action: ${text(shot.action)}.`,
    `Performance: ${text(shot.performance)}.`,
    `Beat direction: ${beat}.`,
    `Opening frame: ${text(shot.frame_plan?.opening_frame)}.`,
    `Temporal progression: ${text(shot.frame_plan?.progression)}.`,
    `Closing frame: ${text(shot.frame_plan?.closing_frame)}.`,
    `Camera: ${text(shot.camera?.framing)}; ${text(shot.camera?.angle)}; ${text(shot.camera?.lens_intent)}; ${text(shot.camera?.movement_path)}; ${text(shot.camera?.movement_speed)}.`,
    `Lighting: ${text(shot.lighting?.source)}; ${text(shot.lighting?.direction)}; ${text(shot.lighting?.contrast)}; ${text(shot.lighting?.colour)}; ${text(shot.lighting?.exposure_intent)}.`,
    `Design: ${text(shot.production_design?.environment)}; wardrobe ${text(shot.production_design?.wardrobe)}; props ${text(shot.production_design?.props)}; materials ${text(shot.production_design?.materials)}.`,
    "Preserve Cole Ley's approved identity references exactly. Keep the uploaded song as external timing authority. Render no final titles, subtitles, logos or legal copy inside generated pixels.",
  ].join(" ");
}

function normaliseShot({ source, scene, sceneIndex, index, count, duration }) {
  const beat = beatInstruction(index, count);
  const location = locationDescription(scene, source);
  const sourceId = id(source.id, `scene-${sceneIndex + 1}-source`);
  const subject = detailed(
    source.subject,
    "Cole Ley remains the precise visual focus, with facial structure, age, hairstyle, skin detail and body proportions locked to the approved identity references",
    12,
  );
  const action = detailed(
    source.action,
    `${beat}; the visible action must create a concrete change between opening and closing frames rather than holding a static pose`,
    24,
  );
  const performance = detailed(
    source.performance || source.performance_direction,
    "Use restrained, emotionally truthful micro-performance through controlled breathing, precise eyeline, subtle facial tension and physically motivated timing",
    24,
  );
  const sourceFrame = object(source.frame_plan);
  const framePlan = {
    ...sourceFrame,
    opening_frame: detailed(
      sourceFrame.opening_frame || source.opening_frame,
      `Open on a fully readable composition in ${location}, with ${subject} placed according to established screen direction and the prior emotional state still visible`,
      30,
    ),
    progression: detailed(
      sourceFrame.progression || source.progression || source.progression_frames,
      `${beat}. Progress continuously through one motivated action, one readable reaction and one camera adjustment; do not freeze, loop or jump between unrelated poses`,
      40,
    ),
    closing_frame: detailed(
      sourceFrame.closing_frame || source.closing_frame,
      "Finish on a stable composition that clearly shows the consequence of this beat and provides a matching movement, shape or eyeline for the following edit",
      30,
    ),
  };
  const sourceCamera = object(source.camera);
  const camera = {
    ...sourceCamera,
    framing: detailed(sourceCamera.framing, "Purposeful medium-close framing that keeps facial performance readable while retaining spatial context", 5),
    angle: detailed(sourceCamera.angle, "Eye-level three-quarter angle supporting intimacy without glamourised posing", 5),
    camera_distance: detailed(sourceCamera.camera_distance, "Consistent physical distance preserving facial geometry and natural perspective", 5),
    lens_intent: detailed(sourceCamera.lens_intent, "Natural perspective with gentle background separation and no facial distortion", 5),
    movement_path: detailed(sourceCamera.movement_path, "One physically possible camera path following the subject's action and established screen direction", 5),
    movement_speed: detailed(sourceCamera.movement_speed, "Controlled measured movement with gentle acceleration at the emotional turn and a settled stop", 5),
    stabilization: detailed(sourceCamera.stabilization, "Controlled dolly or gimbal movement with subtle human weight and no digital floating", 5),
    movement_motivation: detailed(sourceCamera.movement_motivation, "Move only when the subject makes a decision or the emotional information changes", 5),
    focus_target: detailed(sourceCamera.focus_target, "Cole Ley's nearest eye and the facial micro-expression carrying the beat", 5),
    focus_transition: detailed(sourceCamera.focus_transition, "Hold critical facial focus and rack only when story attention transfers", 5),
  };
  const sourceLighting = object(source.lighting);
  const lighting = {
    ...sourceLighting,
    source: detailed(sourceLighting.source, "A motivated practical or environmental key belonging naturally to the location", 5),
    direction: detailed(sourceLighting.direction, "Consistent three-quarter facial direction with believable environmental falloff", 5),
    contrast: detailed(sourceLighting.contrast, "Controlled cinematic contrast with readable eyes, protected skin detail and dense non-crushed shadows", 5),
    colour: detailed(sourceLighting.colour, "Restrained colour-temperature relationship protecting natural skin colour within the scene palette", 5),
    exposure_intent: detailed(sourceLighting.exposure_intent, "Expose for believable skin and practical highlights while retaining wardrobe and shadow texture", 5),
  };
  const sourceDesign = object(source.production_design);
  const wardrobe = detailed(
    sourceDesign.wardrobe || source.wardrobe,
    "Preserve the exact approved wardrobe silhouette, fabric, accessories, grooming and continuity state from adjacent shots",
    5,
  );
  const design = {
    ...sourceDesign,
    environment: detailed(sourceDesign.environment, `Preserve established geography and dressed detail in ${location}; background elements remain stable`, 5),
    wardrobe,
    props: detailed(sourceDesign.props || source.props, "Use only established story-motivated props; otherwise keep the frame deliberately free of invented objects", 5),
    materials: detailed(sourceDesign.materials, "Preserve believable fabric, skin, hair, glass, metal and painted-surface response", 5),
    texture_detail: detailed(sourceDesign.texture_detail, "Retain pores, fine hair, fabric weave, fingerprints, dust and environmental irregularity", 5),
  };
  const sourceContinuity = object(source.continuity);
  const continuity = {
    ...sourceContinuity,
    identity: detailed(sourceContinuity.identity, "Lock Cole Ley's facial structure, age, hairline, skin detail, body proportions and distinctive features", 5),
    product: detailed(sourceContinuity.product, "No commercial product is present; preserve that absence and do not invent branded packaging or promotional props", 5),
    location: detailed(sourceContinuity.location, `Preserve ${location}, including layout, practical lights, weather, time of day and object placement`, 5),
    wardrobe: detailed(sourceContinuity.wardrobe, wardrobe, 5),
    screen_direction: detailed(sourceContinuity.screen_direction, "Maintain established eyeline and movement vector unless a motivated reversal is explicitly shown", 5),
    spatial_geography: detailed(sourceContinuity.spatial_geography, "Keep every subject, prop and camera position consistent so the audience can map the space", 5),
  };
  const sourceAudio = object(source.audio);
  const audio = {
    ...sourceAudio,
    source_sound: detailed(sourceAudio.source_sound, "Subtle location ambience plus physically motivated breath, cloth and movement detail beneath the master song", 5),
    sound_effects: list(sourceAudio.sound_effects || source.sound_effects),
    music: {
      ...object(sourceAudio.music || source.music),
      role: "PRIMARY_SOUNDTRACK",
      preserve_full_song_timing: true,
    },
    silence: detailed(sourceAudio.silence, "Do not mute or replace the uploaded master song", 5),
    mix_intent: detailed(sourceAudio.mix_intent, "The uploaded song remains dominant and uncut; ambience and effects stay subtle and subordinate to vocal clarity", 10),
  };
  const normalised = {
    ...source,
    id: `${sourceId}-beat-${String(index + 1).padStart(2, "0")}`,
    title: detailed(source.title, `${text(scene.title)} — visual beat ${index + 1}`, 8),
    purpose: detailed(source.purpose, `${beat}; add one new visual fact or emotional consequence rather than repeating the previous image`, 20),
    subject,
    action,
    performance,
    duration_seconds: duration,
    medium: text(source.medium) || "generated-video",
    frame_plan: framePlan,
    camera,
    lighting,
    production_design: design,
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
      cleanup: ["Remove temporal artefacts without altering approved identity, performance or camera intent"],
      compositing: [],
      ...object(source.vfx),
    },
    transition_in: detailed(source.transition_in, index === 0 ? "Enter on a motivated cut from the prior scene's final movement or eyeline" : "Cut on matched movement, eyeline or rhythmic emphasis from the preceding beat", 8),
    transition_out: detailed(source.transition_out, index === count - 1 ? "Exit on a resolved composition motivating the next scene through motion, shape or emotional consequence" : "Cut at completion of the new action while preserving motion and screen direction", 8),
    negative_constraints: list(source.negative_constraints).length
      ? source.negative_constraints
      : [
          "No identity drift or face substitution",
          "No malformed hands, duplicated limbs or unstable anatomy",
          "No generated typography, logos or invented branded objects",
          "No background morphing, camera teleportation or screen-direction jumps",
          "No generic posing, excessive slow motion or synthetic beauty treatment",
        ],
    known_failure_modes: list(source.known_failure_modes).length
      ? source.known_failure_modes
      : [
          "facial identity drift during head movement",
          "hand deformation during gesture or contact",
          "background geometry changing between frames",
          "motion cadence becoming floaty or unnaturally slow",
        ],
    repair_instructions: list(source.repair_instructions).length
      ? source.repair_instructions
      : [
          "Repair only the failing temporal region while preserving approved identity, framing, timing and surrounding frames",
          "Use adjacent approved frames and reference assets as continuity anchors",
          "Do not rewrite story action, camera path or song timing during repair",
        ],
  };
  const sourceGeneration = object(source.generation);
  normalised.generation = {
    ...sourceGeneration,
    required: sourceGeneration.required !== false,
    service: text(sourceGeneration.service) || "ai.video.generate",
    capability: text(sourceGeneration.capability) || "ai.video.generate",
    provider_prompt: detailed(
      sourceGeneration.provider_prompt || source.provider_prompt,
      providerPrompt({ scene, shot: normalised, duration, beat }),
      120,
    ),
    negative_prompt: detailed(sourceGeneration.negative_prompt, negativePrompt(), 40),
    output_spec: {
      width: 1920,
      height: 1080,
      aspect_ratio: "16:9",
      fps: 24,
      format: "mp4",
      audio: false,
      preserve_identity: true,
      preserve_temporal_continuity: true,
      render_text_outside_generated_pixels: true,
      ...object(sourceGeneration.output_spec || source.output_spec),
      duration_seconds: duration,
    },
  };
  normalised.metadata = {
    ...object(source.metadata),
    direction_execution_repaired: true,
    source_master_plan_shot_id: source.id || null,
    temporal_beat_index: index,
    temporal_beat_count: count,
  };
  return normalised;
}

function sceneDurations(scenes, target) {
  const current = scenes.map((scene) => positive(scene.duration_seconds, 0));
  const total = current.reduce((sum, value) => sum + value, 0);
  if (!target) return current.map((value) => value || 5);
  if (total <= 0) return exactDurations(target, scenes.length);
  const raw = current.map((value) => target * (value / total));
  const milliseconds = raw.map((value) => Math.max(1, Math.floor(value * 1000)));
  let difference = Math.round(target * 1000) - milliseconds.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  while (difference !== 0) {
    const index = cursor % milliseconds.length;
    if (difference > 0) {
      milliseconds[index] += 1;
      difference -= 1;
    } else if (milliseconds[index] > 1) {
      milliseconds[index] -= 1;
      difference += 1;
    }
    cursor += 1;
  }
  return milliseconds.map((value) => Number((value / 1000).toFixed(3)));
}

function planDuration(plan) {
  const deliverable = list(plan.deliverables)
    .map((item) => positive(item?.output_spec?.duration_seconds, null))
    .find(Boolean);
  const sceneTotal = list(plan.scenes)
    .reduce((sum, scene) => sum + Number(scene.duration_seconds || 0), 0);
  return deliverable || positive(sceneTotal, null);
}

function repairPlan(plan) {
  const source = object(plan);
  if (text(source.workflow_kind).toUpperCase() !== "TEMPORAL") return source;
  const scenes = list(source.scenes);
  if (!scenes.length) return source;
  const targetDuration = planDuration(source);
  const durations = sceneDurations(scenes, targetDuration);
  const repairedScenes = scenes.map((scene, sceneIndex) => {
    const duration = durations[sceneIndex];
    const sourceShots = list(scene.shots).length
      ? list(scene.shots)
      : [{
          id: `${id(scene.id, `scene-${sceneIndex + 1}`)}-source`,
          title: scene.title,
          purpose: scene.objective,
          subject: "Cole Ley",
          action: scene.state_change || scene.objective,
          performance: scene.emotion,
        }];
    const count = Math.max(sourceShots.length, Math.ceil(duration / 5.5));
    const shotDurations = exactDurations(duration, count);
    const shots = Array.from({ length: count }, (_, index) => {
      const sourceIndex = Math.min(
        sourceShots.length - 1,
        Math.floor((index * sourceShots.length) / count),
      );
      return normaliseShot({
        source: sourceShots[sourceIndex],
        scene,
        sceneIndex,
        index,
        count,
        duration: shotDurations[index],
      });
    });
    return {
      ...scene,
      id: id(scene.id, `scene-${sceneIndex + 1}`),
      duration_seconds: duration,
      shots,
      metadata: {
        ...object(scene.metadata),
        direction_execution_repaired: true,
        repaired_shot_count: shots.length,
      },
    };
  });
  const repairedDuration = repairedScenes.reduce(
    (sum, scene) => sum + Number(scene.duration_seconds || 0),
    0,
  );
  const deliverables = list(source.deliverables).map((deliverable, index) => ({
    ...deliverable,
    id: id(deliverable.id, `deliverable-${index + 1}`),
    type: text(deliverable.type) || "VIDEO",
    purpose: detailed(deliverable.purpose, "Full-song master music video preserving the uploaded soundtrack and continuous visual story", 15),
    output_spec: {
      width: 1920,
      height: 1080,
      aspect_ratio: "16:9",
      fps: 24,
      format: "mp4",
      preserve_full_song_audio: true,
      exact_duration_required: true,
      ...object(deliverable.output_spec),
      duration_seconds: targetDuration || repairedDuration,
    },
  }));
  return {
    ...source,
    deliverables: deliverables.length
      ? deliverables
      : [{
          id: "full-song-master",
          type: "VIDEO",
          purpose: "Full-song master music video preserving the uploaded soundtrack and continuous visual story",
          channels: [],
          languages: [],
          output_spec: {
            width: 1920,
            height: 1080,
            aspect_ratio: "16:9",
            fps: 24,
            format: "mp4",
            duration_seconds: targetDuration || repairedDuration,
            preserve_full_song_audio: true,
            exact_duration_required: true,
          },
        }],
    scenes: repairedScenes,
    production_contract: {
      ...object(source.production_contract),
      exact_duration_seconds: targetDuration || repairedDuration,
      maximum_generated_shot_duration_seconds: 5.5,
      required_minimum_shot_count: repairedScenes.reduce(
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
      direction_execution_repaired: true,
      repair_version: "DIRECTION_EXECUTION_REPAIR_V1",
      repaired_at: new Date().toISOString(),
    },
  };
}

function directionTextContainer(result = {}) {
  if (result?.output?.output && typeof result.output.output === "object") {
    return result.output.output;
  }
  if (result?.output && typeof result.output === "object") {
    return result.output;
  }
  return null;
}

export function installCreativeDirectionExecutionRepairPatch() {
  if (ServiceExecutionRuntime[PATCH_FLAG]) return;
  const originalExecute = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );
  Object.defineProperty(ServiceExecutionRuntime, PATCH_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  ServiceExecutionRuntime.execute = async function executeWithDirectionRepair(
    input = {},
  ) {
    const result = await originalExecute(input);
    if (text(input.category).toUpperCase() !== "CREATIVE_DIRECTION") {
      return result;
    }
    const container = directionTextContainer(result);
    const plan = parseJson(container?.text || container?.content || container);
    if (!plan) return result;
    const repaired = repairPlan(plan);
    const repairedText = JSON.stringify(repaired);
    if (container) {
      container.text = repairedText;
      Object.assign(container, repaired);
      container.direction_execution_repair = {
        applied: true,
        version: "DIRECTION_EXECUTION_REPAIR_V1",
        original_scene_count: list(plan.scenes).length,
        original_shot_count: list(plan.scenes)
          .reduce((sum, scene) => sum + list(scene.shots).length, 0),
        repaired_scene_count: list(repaired.scenes).length,
        repaired_shot_count: list(repaired.scenes)
          .reduce((sum, scene) => sum + list(scene.shots).length, 0),
      };
    }
    return result;
  };
}

installCreativeDirectionExecutionRepairPatch();

export const CreativeDirectionExecutionRepairPatch = {
  install: installCreativeDirectionExecutionRepairPatch,
  repair: repairPlan,
};
