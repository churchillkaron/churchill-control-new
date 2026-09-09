function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function asList(value) {
  if (Array.isArray(value)) return value.filter((v) => text(v));
  return text(value) ? [text(value)] : [];
}
function resolutionRatio(value) {
  const match = text(value).match(/^(\d+)\s*[xX]\s*(\d+)$/);
  return match ? Number(match[1]) / Number(match[2]) : null;
}
function aspectRatio(value) {
  const match = text(value).match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  return match ? Number(match[1]) / Number(match[2]) : null;
}
function canonicalVideoSpec(spec = {}) {
  const source = object(spec);
  const ar = text(source.aspect_ratio) || "16:9";
  const resolution = text(source.resolution);
  const ratio = resolutionRatio(resolution);
  const expected = aspectRatio(ar);
  const consistent = ratio && expected && Math.abs(ratio - expected) < 0.03;
  return {
    ...source,
    aspect_ratio: ar,
    resolution: consistent ? resolution : "1920x1080",
    frame_rate: Math.max(1, finite(source.frame_rate) || 24),
  };
}
function allocate(items, target, floor = 0.5) {
  const source = list(items);
  if (!source.length) return [];
  const ms = Math.round(Number(target) * 1000);
  const floorMs = Math.round(floor * 1000);
  if (ms < source.length * floorMs) return source;
  const free = ms - source.length * floorMs;
  const weights = source.map((x) => Math.max(0.001, finite(x.duration_seconds) || 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => free * w / total);
  const parts = raw.map(Math.floor);
  let remainder = free - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [i, v - parts[i]]).sort((a,b) => b[1]-a[1] || a[0]-b[0]);
  for (let i = 0; remainder > 0; i += 1, remainder -= 1) parts[order[i % order.length][0]] += 1;
  return source.map((item, i) => ({ ...item, duration_seconds: (floorMs + parts[i]) / 1000 }));
}
function explicitAbsence(label, reason) {
  return `No ${label} is introduced; ${reason}`;
}
function normalizeShot(shot, scene, shotIndex, masterSpec, fallbackGeneration) {
  const camera = object(shot.camera);
  const continuity = object(shot.continuity);
  const audio = object(shot.audio);
  const sceneCamera = object(scene.camera_style);
  const sceneAudio = object(scene.audio_style);
  const sceneLocation = object(scene.location);
  const productNames = list(scene.products).map((p) => text(p?.name)).filter(Boolean).join(", ");
  const framingAngle = text(camera.framing).match(/\b(low[- ]angle|high[- ]angle|eye[- ]level|overhead|top[- ]down)\b/i)?.[1] || "";
  const angle = text(camera.angle) || text(sceneCamera.angle) || framingAngle;
  const focusTarget = text(camera.focus_target || camera.focus);
  const rawFocus = text(camera.focus_transition);
  const focusTransition = !rawFocus || /^(none|n\/a|not applicable)\b/i.test(rawFocus)
    ? (focusTarget ? `Focus remains locked on ${focusTarget} throughout; no rack is used so the intended subject hierarchy stays stable.` : "Focus remains fixed through the shot so the established subject hierarchy does not drift.")
    : rawFocus;
  const noActors = list(scene.actors).length === 0;
  const sceneSound = text(sceneAudio.sound_design);
  const pressureBefore = finite(scene?.tension?.pressure_before);
  const pressureAfter = finite(scene?.tension?.pressure_after);
  const energy = finite(shot.energy_level) ?? pressureAfter ?? pressureBefore ?? 50;
  const tempo = text(shot.tempo_role).toUpperCase() || (pressureAfter !== null && pressureBefore !== null
    ? (pressureAfter > pressureBefore ? "BUILD" : pressureAfter < pressureBefore ? "RELEASE" : "HOLD")
    : "HOLD");
  const generation = { ...object(fallbackGeneration), ...object(shot.generation) };
  const directedDuration = finite(shot.duration_seconds);
  const generationSpec = canonicalVideoSpec({ ...masterSpec, ...object(generation.output_spec) });
  return {
    ...shot,
    camera: {
      ...camera,
      angle: angle || "Camera angle follows the established scene framing without changing the subject relationship.",
      focus_transition: focusTransition,
    },
    continuity: {
      ...continuity,
      identity: text(continuity.identity) || (text(shot.subject) ? `Subject identity remains ${text(shot.subject)} throughout this shot.` : explicitAbsence("new identity", "the established scene subject remains the continuity authority.")),
      product: text(continuity.product) || (productNames ? `Product continuity remains ${productNames}.` : explicitAbsence("separate product", "the shot is governed by the established scene subject.")),
      location: text(continuity.location) || (text(sceneLocation.name) ? `${text(sceneLocation.name)} remains the location authority; ${text(sceneLocation.atmosphere) || "the established environment is preserved"}.` : explicitAbsence("new location", "the established scene geography is preserved.")),
      wardrobe: text(continuity.wardrobe) || (noActors ? explicitAbsence("wardrobe", "there is no human talent in this scene and the machinery/environment carry the action.") : "Wardrobe remains continuous with the established scene talent."),
      screen_direction: text(continuity.screen_direction) || (text(camera.movement_path) ? `Screen direction follows ${text(camera.movement_path)}.` : `Screen direction preserves the action described as: ${text(shot.action) || "the established scene movement"}.`),
      spatial_geography: text(continuity.spatial_geography) || [text(sceneLocation.name), text(sceneLocation.scale), text(camera.framing)].filter(Boolean).join("; ") || "Spatial geography preserves the established scene layout and subject relationship.",
    },
    audio: {
      ...audio,
      source_sound: text(audio.source_sound) || (sceneSound ? `Source sound follows the scene sound design: ${sceneSound}` : "Authentic location ambience follows the visible physical action in frame."),
      mix_intent: text(audio.mix_intent) || (sceneSound ? `Mix keeps the scene's physical sound design primary: ${sceneSound}` : "Mix keeps physical source sound primary and avoids decorative music masking the action."),
    },
    energy_level: Math.max(0, Math.min(100, energy)),
    tempo_role: ["HOLD","BUILD","ACCELERATE","PEAK","RELEASE","SILENCE"].includes(tempo) ? tempo : "HOLD",
    transition_in: text(shot.transition_in) || (shotIndex === 0 ? `Scene enters through its stated transition logic: ${text(scene.transition_logic) || "the prior story state resolves into this action"}.` : "Direct cut from the preceding shot preserves action continuity."),
    transition_out: text(shot.transition_out) || (shotIndex === list(scene.shots).length - 1 ? `Scene exits through its stated transition logic: ${text(scene.transition_logic) || "the completed action hands off to the next story state"}.` : "Direct cut to the next shot advances the same scene action."),
    negative_constraints: asList(shot.negative_constraints),
    known_failure_modes: asList(shot.known_failure_modes),
    repair_instructions: asList(shot.repair_instructions),
    generation: {
      ...generation,
      required: generation.required === false ? false : true,
      service: text(generation.service) || text(fallbackGeneration?.service) || "ai.video.generate",
      capability: text(generation.capability) || text(fallbackGeneration?.capability) || "ai.video.generate",
      output_spec: {
        ...generationSpec,
        ...(directedDuration !== null ? { duration_seconds: directedDuration } : {}),
      },
    },
  };
}
export function normalizeTemporalMechanicalContract(plan = {}, { duration_seconds = null } = {}) {
  const duration = finite(duration_seconds ?? plan?.temporal_contract?.duration_seconds ?? plan?.deliverables?.[0]?.output_spec?.duration_seconds);
  if (!duration || duration <= 0) return plan;
  const deliverables = list(plan.deliverables);
  const masterSpec = canonicalVideoSpec(object(deliverables[0]?.output_spec));
  let scenes = allocate(plan.scenes, duration, 0.5);
  const fallbackGeneration = scenes.flatMap((s) => list(s.shots)).map((s) => object(s.generation)).find((g) => text(g.service) || text(g.capability)) || {};
  scenes = scenes.map((scene) => {
    const shots = allocate(scene.shots, scene.duration_seconds, 0.5);
    return { ...scene, shots: shots.map((shot, index) => normalizeShot(shot, { ...scene, shots }, index, masterSpec, fallbackGeneration)) };
  });
  return {
    ...plan,
    deliverables: deliverables.map((d, index) => index === 0 ? { ...d, output_spec: { ...masterSpec, duration_seconds: duration } } : d),
    scenes,
  };
}
export default normalizeTemporalMechanicalContract;
