#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function hasContent(value) {
  if (typeof value === "string") return Boolean(text(value));
  if (Array.isArray(value)) return value.some(hasContent);
  if (value && typeof value === "object") {
    return Object.values(value).some(hasContent);
  }
  return value !== undefined && value !== null && value !== false;
}

function leafText(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  if (Array.isArray(value)) return value.map(leafText).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value).map(leafText).filter(Boolean).join(" ");
  }
  return "";
}

function normalizedWords(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function jaccard(left, right) {
  const a = new Set(normalizedWords(left));
  const b = new Set(normalizedWords(right));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function firstText(...values) {
  return values.map(text).find(Boolean) || "";
}

function shotDuration(shot = {}) {
  return finite(
    shot.duration_seconds ??
      shot.duration ??
      shot.timing?.duration_seconds ??
      shot.timeline?.duration_seconds,
  );
}

function sceneDuration(scene = {}) {
  const explicit = finite(
    scene.duration_seconds ??
      scene.duration ??
      scene.timing?.duration_seconds ??
      scene.timeline?.duration_seconds,
  );
  if (explicit !== null) return explicit;
  const durations = list(scene.shots).map(shotDuration);
  return durations.length && durations.every((value) => value !== null)
    ? durations.reduce((sum, value) => sum + value, 0)
    : null;
}

function frameDescription(shot = {}, kind) {
  const framePlan = object(shot.frame_plan);
  if (kind === "opening") {
    return firstText(
      framePlan.opening_frame,
      shot.opening_frame?.description,
      typeof shot.opening_frame === "string" ? shot.opening_frame : "",
    );
  }
  if (kind === "progression") {
    return firstText(
      framePlan.progression,
      leafText(shot.progression_frames),
      shot.temporal_progression,
    );
  }
  return firstText(
    framePlan.closing_frame,
    shot.closing_frame?.description,
    typeof shot.closing_frame === "string" ? shot.closing_frame : "",
  );
}

function cameraText(shot = {}) {
  return leafText(shot.camera || shot.camera_direction || shot.camera_style);
}

function movementToken(shot = {}) {
  const source = cameraText(shot).toLowerCase();
  const known = [
    "locked",
    "static",
    "handheld",
    "dolly",
    "push",
    "pull",
    "pan",
    "tilt",
    "orbit",
    "tracking",
    "crane",
    "drone",
    "zoom",
    "rack",
    "whip",
    "gimbal",
    "pedestal",
    "arc",
  ];
  return known.find((value) => source.includes(value)) ||
    firstText(shot.camera?.movement_path, shot.camera?.movement, shot.camera_movement) ||
    "UNSPECIFIED";
}

function scaleToken(shot = {}) {
  const source = firstText(
    shot.camera?.framing,
    shot.camera?.shot_size,
    shot.framing,
    shot.shot_size,
  ).toLowerCase();
  const known = [
    "extreme wide",
    "establishing",
    "wide",
    "full body",
    "medium wide",
    "medium close",
    "medium",
    "close-up",
    "close up",
    "extreme close",
    "macro",
    "detail",
    "overhead",
    "pov",
  ];
  return known.find((value) => source.includes(value)) || source || "UNSPECIFIED";
}

function primarySourceId(shot = {}) {
  return firstText(
    shot.primary_source_asset_id,
    shot.metadata?.primary_source_asset_id,
    shot.generation?.primary_source_asset_id,
    shot.generation?.provider_parameters?.primary_source_asset_id,
    list(shot.reference_assets).find(
      (reference) => text(reference?.role).toUpperCase() === "PRIMARY_SOURCE",
    )?.asset_id,
  );
}

function persistedPrompt(shot = {}) {
  return firstText(
    shot.provider_prompt,
    shot.prompt,
    shot.generation_prompt,
    shot.generation?.provider_prompt,
    shot.generation?.prompt,
  );
}

function issue(severity, code, issuePath, message, evidence = null) {
  return { severity, code, path: issuePath, message, evidence };
}

function requireText(issues, value, code, issuePath, message) {
  if (!text(value)) issues.push(issue("BLOCKER", code, issuePath, message));
}

function requireContent(issues, value, code, issuePath, message) {
  if (!hasContent(value)) issues.push(issue("BLOCKER", code, issuePath, message));
}

const inputPath = path.resolve(text(process.argv[2]));
if (!inputPath || !fs.existsSync(inputPath)) {
  throw new Error(`DIRECTION_PLAN_FILE_NOT_FOUND:${inputPath || "MISSING"}`);
}

const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const plan = object(raw.plan || raw.direction?.plan || raw.output?.plan || raw);
const scenes = list(plan.scenes);
const shots = scenes.flatMap((scene, sceneIndex) =>
  list(scene.shots).map((shot, shotIndex) => ({
    scene,
    shot,
    sceneIndex,
    shotIndex,
    path: `plan.scenes.${sceneIndex}.shots.${shotIndex}`,
  })),
);

const technicalIssues = [];
const creativeIssues = [];
const sceneSummaries = [];
const shotSummaries = [];

if (!scenes.length) {
  technicalIssues.push(issue("BLOCKER", "SCENES_MISSING", "plan.scenes", "No scenes were found"));
}
if (!shots.length) {
  technicalIssues.push(issue("BLOCKER", "SHOTS_MISSING", "plan.scenes", "No shots were found"));
}
if (plan.validation?.passed !== true) {
  technicalIssues.push(
    issue(
      "BLOCKER",
      "PLAN_VALIDATION_NOT_PASSED",
      "plan.validation.passed",
      "The direction plan does not carry a passed validation result",
      plan.validation || null,
    ),
  );
}

const concept = object(plan.concept);
const story = object(plan.story);
for (const [field, label] of Object.entries({
  creative_thesis: "creative thesis",
  hook: "concept hook",
  message: "message",
  narrative: "complete narrative",
  visual_system: "visual system",
  emotional_promise: "emotional promise",
  call_to_action: "call to action",
})) {
  requireText(
    creativeIssues,
    concept[field],
    `CONCEPT_${field.toUpperCase()}_MISSING`,
    `plan.concept.${field}`,
    `The ${label} is missing`,
  );
}
for (const [field, label] of Object.entries({
  hook: "story hook",
  audience_tension: "audience tension",
  escalation: "escalation",
  observable_proof: "observable proof",
  turn: "turn",
  resolution: "resolution",
  call_to_action: "earned call to action",
  emotional_arc: "emotional arc",
  anti_cliche_strategy: "anti-cliche strategy",
})) {
  requireText(
    creativeIssues,
    story[field],
    `STORY_${field.toUpperCase()}_MISSING`,
    `plan.story.${field}`,
    `The ${label} is missing`,
  );
}

const sceneIds = scenes.map((scene) => text(scene.id)).filter(Boolean);
const shotIds = shots.map(({ shot }) => text(shot.id)).filter(Boolean);
if (sceneIds.length !== scenes.length || new Set(sceneIds).size !== sceneIds.length) {
  technicalIssues.push(issue("BLOCKER", "SCENE_IDENTIFIERS_INVALID", "plan.scenes", "Scene IDs must exist and be unique"));
}
if (shotIds.length !== shots.length || new Set(shotIds).size !== shotIds.length) {
  technicalIssues.push(issue("BLOCKER", "SHOT_IDENTIFIERS_INVALID", "plan.scenes.*.shots", "Shot IDs must exist and be unique"));
}

let calculatedDuration = 0;
let durationKnown = true;
const primaryUse = new Map();
const movementVocabulary = [];
const scaleVocabulary = [];
const purposeEntries = [];
const stateChanges = [];
const transitions = [];
let persistedPromptCount = 0;

for (const [sceneIndex, scene] of scenes.entries()) {
  const scenePath = `plan.scenes.${sceneIndex}`;
  const duration = sceneDuration(scene);
  const sceneShots = list(scene.shots);

  requireText(creativeIssues, scene.objective, "SCENE_OBJECTIVE_MISSING", `${scenePath}.objective`, "Scene objective is missing");
  requireText(creativeIssues, scene.story_state_before, "SCENE_STATE_BEFORE_MISSING", `${scenePath}.story_state_before`, "Story state before the scene is missing");
  requireText(creativeIssues, scene.state_change, "SCENE_STATE_CHANGE_MISSING", `${scenePath}.state_change`, "The scene does not specify a causal state change");
  requireText(creativeIssues, scene.story_state_after, "SCENE_STATE_AFTER_MISSING", `${scenePath}.story_state_after`, "Story state after the scene is missing");
  requireText(creativeIssues, scene.transition_logic, "SCENE_TRANSITION_LOGIC_MISSING", `${scenePath}.transition_logic`, "The reason the next scene follows is missing");
  requireContent(technicalIssues, scene.location, "SCENE_LOCATION_MISSING", `${scenePath}.location`, "Scene location specification is missing");
  requireContent(technicalIssues, scene.visual_style, "SCENE_VISUAL_STYLE_MISSING", `${scenePath}.visual_style`, "Scene visual style is missing");
  requireContent(technicalIssues, scene.camera_style, "SCENE_CAMERA_STYLE_MISSING", `${scenePath}.camera_style`, "Scene camera style is missing");
  requireContent(technicalIssues, scene.audio_style, "SCENE_AUDIO_STYLE_MISSING", `${scenePath}.audio_style`, "Scene audio style is missing");

  if (!sceneShots.length) {
    technicalIssues.push(issue("BLOCKER", "SCENE_WITHOUT_SHOTS", `${scenePath}.shots`, "Scene contains no shots"));
  }
  if (duration === null || duration <= 0) {
    durationKnown = false;
    technicalIssues.push(issue("BLOCKER", "SCENE_DURATION_INVALID", `${scenePath}.duration_seconds`, "Scene duration is invalid", duration));
  }

  if (text(scene.state_change)) stateChanges.push({ path: scenePath, value: scene.state_change });
  if (text(scene.transition_logic)) transitions.push(text(scene.transition_logic));

  sceneSummaries.push({
    id: text(scene.id) || `scene-${sceneIndex + 1}`,
    title: firstText(scene.title, scene.name),
    objective: text(scene.objective),
    state_change: text(scene.state_change),
    duration_seconds: duration,
    shot_count: sceneShots.length,
  });
}

for (const entry of shots) {
  const { shot, path: shotPath } = entry;
  const duration = shotDuration(shot);
  const opening = frameDescription(shot, "opening");
  const progression = frameDescription(shot, "progression");
  const closing = frameDescription(shot, "closing");
  const camera = object(shot.camera);
  const generation = object(shot.generation);
  const primary = primarySourceId(shot);
  const prompt = persistedPrompt(shot);
  const movement = movementToken(shot);
  const scale = scaleToken(shot);

  if (duration === null || duration <= 0) {
    durationKnown = false;
    technicalIssues.push(issue("BLOCKER", "SHOT_DURATION_INVALID", `${shotPath}.duration_seconds`, "Shot duration is invalid", duration));
  } else {
    calculatedDuration += duration;
    if (duration > 12) {
      creativeIssues.push(issue("WARNING", "SHOT_DURATION_LONG", `${shotPath}.duration_seconds`, "A shot longer than 12 seconds needs deliberate internal progression", duration));
    }
  }

  requireText(creativeIssues, shot.purpose, "SHOT_PURPOSE_MISSING", `${shotPath}.purpose`, "Shot purpose is missing");
  requireText(technicalIssues, shot.subject, "SHOT_SUBJECT_MISSING", `${shotPath}.subject`, "Exact visible subject is missing");
  requireText(technicalIssues, shot.action, "SHOT_ACTION_MISSING", `${shotPath}.action`, "Exact visible action over time is missing");
  requireText(technicalIssues, shot.performance, "SHOT_PERFORMANCE_MISSING", `${shotPath}.performance`, "Performance and micro-behaviour direction is missing");
  requireText(technicalIssues, opening, "SHOT_OPENING_FRAME_MISSING", `${shotPath}.frame_plan.opening_frame`, "Opening frame is missing");
  requireText(technicalIssues, progression, "SHOT_PROGRESSION_MISSING", `${shotPath}.frame_plan.progression`, "Temporal progression is missing");
  requireText(technicalIssues, closing, "SHOT_CLOSING_FRAME_MISSING", `${shotPath}.frame_plan.closing_frame`, "Closing frame is missing");

  requireText(technicalIssues, camera.framing, "CAMERA_FRAMING_MISSING", `${shotPath}.camera.framing`, "Camera framing is missing");
  requireText(technicalIssues, camera.angle, "CAMERA_ANGLE_MISSING", `${shotPath}.camera.angle`, "Camera angle is missing");
  requireText(technicalIssues, camera.movement_path, "CAMERA_MOVEMENT_PATH_MISSING", `${shotPath}.camera.movement_path`, "Physical camera movement path is missing");
  requireText(technicalIssues, camera.movement_motivation, "CAMERA_MOVEMENT_MOTIVATION_MISSING", `${shotPath}.camera.movement_motivation`, "Camera movement motivation is missing");
  requireText(technicalIssues, camera.focus_target, "CAMERA_FOCUS_TARGET_MISSING", `${shotPath}.camera.focus_target`, "Camera focus target is missing");

  requireContent(technicalIssues, shot.lighting, "SHOT_LIGHTING_MISSING", `${shotPath}.lighting`, "Lighting specification is missing");
  requireContent(technicalIssues, shot.production_design, "SHOT_PRODUCTION_DESIGN_MISSING", `${shotPath}.production_design`, "Production-design specification is missing");
  requireContent(technicalIssues, shot.continuity, "SHOT_CONTINUITY_MISSING", `${shotPath}.continuity`, "Continuity specification is missing");
  requireContent(technicalIssues, shot.audio || shot.sound_design || shot.music || shot.sound_effects, "SHOT_AUDIO_DIRECTION_MISSING", `${shotPath}.audio`, "Shot sound direction is missing");
  requireText(technicalIssues, shot.transition_in, "SHOT_TRANSITION_IN_MISSING", `${shotPath}.transition_in`, "Editorial transition into the shot is missing");
  requireText(technicalIssues, shot.transition_out, "SHOT_TRANSITION_OUT_MISSING", `${shotPath}.transition_out`, "Editorial transition out of the shot is missing");
  requireContent(technicalIssues, shot.negative_constraints, "NEGATIVE_CONSTRAINTS_MISSING", `${shotPath}.negative_constraints`, "Specific negative constraints are missing");
  requireContent(technicalIssues, shot.known_failure_modes, "KNOWN_FAILURE_MODES_MISSING", `${shotPath}.known_failure_modes`, "Known failure modes are missing");
  requireContent(technicalIssues, shot.repair_instructions, "REPAIR_INSTRUCTIONS_MISSING", `${shotPath}.repair_instructions`, "Repair instructions are missing");

  if (generation.required !== true) {
    technicalIssues.push(issue("BLOCKER", "GENERATION_REQUIRED_FLAG_INVALID", `${shotPath}.generation.required`, "Generation-required flag must be true", generation.required));
  }
  requireText(technicalIssues, generation.service || generation.capability, "GENERATION_SERVICE_MISSING", `${shotPath}.generation.service`, "Generation service or capability is missing");
  requireContent(technicalIssues, generation.output_spec, "GENERATION_OUTPUT_SPEC_MISSING", `${shotPath}.generation.output_spec`, "Generation output specification is missing");

  if (prompt) {
    persistedPromptCount += 1;
    technicalIssues.push(
      issue(
        "BLOCKER",
        "PERSISTED_PROVIDER_PROMPT_FORBIDDEN",
        `${shotPath}.generation.provider_prompt`,
        "Provider prompts must be serialized only at the transport boundary and must not be stored in direction output",
      ),
    );
  }

  const references = list(shot.reference_assets);
  const sourceBearing = Boolean(primary || references.length || ["LIVE-ASSET", "ASSET-LED-MOTION"].includes(text(shot.medium).toUpperCase().replaceAll("_", "-")));
  if (sourceBearing && !primary) {
    technicalIssues.push(issue("BLOCKER", "PRIMARY_SOURCE_MISSING", `${shotPath}.primary_source_asset_id`, "A source-bearing shot lacks one primary source"));
  }

  if (primary) primaryUse.set(primary, (primaryUse.get(primary) || 0) + 1);
  movementVocabulary.push(movement);
  scaleVocabulary.push(scale);
  if (text(shot.purpose)) purposeEntries.push({ path: shotPath, value: shot.purpose });
  if (text(shot.transition_out)) transitions.push(text(shot.transition_out));

  const structuredSpec = {
    purpose: shot.purpose,
    subject: shot.subject,
    action: shot.action,
    performance: shot.performance,
    frame_plan: { opening, progression, closing },
    camera: shot.camera,
    lighting: shot.lighting,
    production_design: shot.production_design,
    continuity: shot.continuity,
    audio: shot.audio || shot.sound_design,
    transitions: [shot.transition_in, shot.transition_out],
    negative_constraints: shot.negative_constraints,
    known_failure_modes: shot.known_failure_modes,
    repair_instructions: shot.repair_instructions,
    generation: {
      required: generation.required,
      service: generation.service,
      capability: generation.capability,
      output_spec: generation.output_spec,
    },
  };
  const specCharacters = leafText(structuredSpec).length;
  if (specCharacters < 450) {
    creativeIssues.push(issue("WARNING", "STRUCTURED_SHOT_SPEC_THIN", shotPath, "Structured shot direction is unusually thin for controlled premium production", specCharacters));
  }

  shotSummaries.push({
    scene_id: text(entry.scene.id),
    shot_id: text(shot.id),
    purpose: text(shot.purpose),
    duration_seconds: duration,
    medium: text(shot.medium),
    primary_source_asset_id: primary || null,
    movement,
    scale,
    structured_spec_characters: specCharacters,
    persisted_provider_prompt: Boolean(prompt),
  });
}

for (let index = 0; index < purposeEntries.length; index += 1) {
  for (let other = index + 1; other < purposeEntries.length; other += 1) {
    const similarity = jaccard(purposeEntries[index].value, purposeEntries[other].value);
    if (similarity >= 0.86) {
      creativeIssues.push(issue("WARNING", "SHOT_PURPOSE_REPETITIVE", purposeEntries[other].path, "Two shots appear to serve nearly the same narrative purpose", { compared_with: purposeEntries[index].path, similarity: Number(similarity.toFixed(3)) }));
    }
  }
}

for (let index = 0; index < stateChanges.length; index += 1) {
  for (let other = index + 1; other < stateChanges.length; other += 1) {
    const similarity = jaccard(stateChanges[index].value, stateChanges[other].value);
    if (similarity >= 0.82) {
      creativeIssues.push(issue("WARNING", "SCENE_STATE_CHANGE_REPETITIVE", stateChanges[other].path, "Two scenes produce highly similar state changes", { compared_with: stateChanges[index].path, similarity: Number(similarity.toFixed(3)) }));
    }
  }
}

const movementDiversity = unique(movementVocabulary.filter((value) => value !== "UNSPECIFIED"));
const scaleDiversity = unique(scaleVocabulary.filter((value) => value !== "UNSPECIFIED"));
const transitionDiversity = unique(transitions);
if (shots.length >= 8 && movementDiversity.length < 3) {
  creativeIssues.push(issue("WARNING", "CAMERA_MOVEMENT_VARIETY_LOW", "plan.scenes.*.shots.*.camera", "Camera movement vocabulary is too narrow", movementDiversity));
}
if (shots.length >= 8 && scaleDiversity.length < 4) {
  creativeIssues.push(issue("WARNING", "SHOT_SCALE_VARIETY_LOW", "plan.scenes.*.shots.*.camera.framing", "Shot-scale progression lacks variety", scaleDiversity));
}
if (shots.length >= 8 && transitionDiversity.length < 4) {
  creativeIssues.push(issue("WARNING", "EDIT_TRANSITION_VARIETY_LOW", "plan.scenes.*.shots.*.transition_out", "Editorial transition vocabulary is too narrow", transitionDiversity));
}

const dominantAsset = [...primaryUse.entries()].sort((a, b) => b[1] - a[1])[0] || null;
if (dominantAsset && dominantAsset[1] / Math.max(1, shots.length) > 0.62) {
  creativeIssues.push(issue("WARNING", "PRIMARY_ASSET_OVERUSED", "plan.scenes.*.shots.*.primary_source_asset_id", "One source asset dominates the film and may make it feel repetitive", { asset_id: dominantAsset[0], shot_count: dominantAsset[1], ratio: Number((dominantAsset[1] / shots.length).toFixed(3)) }));
}

const deliverableDuration = finite(list(plan.deliverables)[0]?.output_spec?.duration_seconds);
if (durationKnown && deliverableDuration !== null && Math.abs(calculatedDuration - deliverableDuration) > 0.001) {
  technicalIssues.push(issue("BLOCKER", "MASTER_DURATION_MISMATCH", "plan.deliverables.0.output_spec.duration_seconds", "Shot duration sum does not match the master deliverable", { shot_sum: calculatedDuration, deliverable_duration: deliverableDuration }));
}
for (const [sceneIndex, scene] of scenes.entries()) {
  const expected = sceneDuration(scene);
  const actual = list(scene.shots).map(shotDuration).reduce((sum, value) => sum + (value || 0), 0);
  if (expected !== null && Math.abs(expected - actual) > 0.001) {
    technicalIssues.push(issue("BLOCKER", "SCENE_SHOT_DURATION_MISMATCH", `plan.scenes.${sceneIndex}`, "Shot duration sum does not match scene duration", { scene_duration: expected, shot_sum: actual }));
  }
}

const technicalBlockers = technicalIssues.filter((item) => item.severity === "BLOCKER");
const technicalWarnings = technicalIssues.filter((item) => item.severity === "WARNING");
const creativeBlockers = creativeIssues.filter((item) => item.severity === "BLOCKER");
const creativeWarnings = creativeIssues.filter((item) => item.severity === "WARNING");
const technicalScore = Math.max(0, 100 - technicalBlockers.length * 12 - technicalWarnings.length * 3);
const creativeScore = Math.max(0, 100 - creativeBlockers.length * 15 - creativeWarnings.length * 4);
const technicalReadiness = technicalBlockers.length ? "FAIL" : technicalScore >= 90 ? "PASS" : "WARN";
const worldClassReadiness = creativeBlockers.length ? "FAIL" : creativeScore >= 85 ? "PASS" : creativeScore >= 65 ? "WARN" : "FAIL";
const recommendation = technicalReadiness === "PASS" && worldClassReadiness === "PASS"
  ? "READY_FOR_PRODUCTION_COST_ESTIMATE"
  : "HOLD_PRODUCTION_FOR_DIRECTION_REVIEW";

const report = {
  contract: "CREATIVE_DIRECTION_STRUCTURED_QUALITY_AUDIT_V2",
  input_path: inputPath,
  generated_at: new Date().toISOString(),
  provider_calls_executed: false,
  wallet_changed: false,
  graph_created: false,
  tasks_created: false,
  production_authorized: false,
  summary: {
    scene_count: scenes.length,
    shot_count: shots.length,
    calculated_duration_seconds: durationKnown ? Number(calculatedDuration.toFixed(3)) : null,
    persisted_provider_prompt_count: persistedPromptCount,
    promptless_direction_spec: persistedPromptCount === 0 ? "PASS" : "FAIL",
    technical_score: technicalScore,
    creative_score: creativeScore,
    technical_readiness: technicalReadiness,
    world_class_readiness: worldClassReadiness,
    recommendation,
    technical_blocker_count: technicalBlockers.length,
    technical_warning_count: technicalWarnings.length,
    creative_blocker_count: creativeBlockers.length,
    creative_warning_count: creativeWarnings.length,
    camera_movement_diversity: movementDiversity,
    shot_scale_diversity: scaleDiversity,
    transition_diversity_count: transitionDiversity.length,
    unique_primary_source_count: primaryUse.size,
  },
  technical_issues: technicalIssues,
  creative_issues: creativeIssues,
  scenes: sceneSummaries,
  shots: shotSummaries,
};

const outputPath = path.resolve(
  text(process.env.AUDIT_OUTPUT) ||
    `${inputPath.replace(/\.json$/i, "")}.structured-quality-audit.json`,
);
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("PROMPTLESS STRUCTURED CREATIVE DIRECTION AUDIT");
console.log("============================================================");
console.log(`INPUT=${inputPath}`);
console.log(`AUDIT_OUTPUT=${outputPath}`);
console.log(`SCENE_COUNT=${scenes.length}`);
console.log(`SHOT_COUNT=${shots.length}`);
console.log(`CALCULATED_DURATION_SECONDS=${durationKnown ? Number(calculatedDuration.toFixed(3)) : "UNRESOLVED"}`);
console.log(`PERSISTED_PROVIDER_PROMPT_COUNT=${persistedPromptCount}`);
console.log(`PROMPTLESS_DIRECTION_SPEC=${persistedPromptCount === 0 ? "PASS" : "FAIL"}`);
console.log(`TECHNICAL_SCORE=${technicalScore}`);
console.log(`CREATIVE_SCORE=${creativeScore}`);
console.log(`TECHNICAL_READINESS=${technicalReadiness}`);
console.log(`WORLD_CLASS_READINESS=${worldClassReadiness}`);
console.log(`PRODUCTION_RECOMMENDATION=${recommendation}`);
console.log(`TECHNICAL_BLOCKER_COUNT=${technicalBlockers.length}`);
console.log(`TECHNICAL_WARNING_COUNT=${technicalWarnings.length}`);
console.log(`CREATIVE_BLOCKER_COUNT=${creativeBlockers.length}`);
console.log(`CREATIVE_WARNING_COUNT=${creativeWarnings.length}`);
console.log(`CAMERA_MOVEMENT_DIVERSITY=${JSON.stringify(movementDiversity)}`);
console.log(`SHOT_SCALE_DIVERSITY=${JSON.stringify(scaleDiversity)}`);
console.log(`TRANSITION_DIVERSITY_COUNT=${transitionDiversity.length}`);
console.log(`UNIQUE_PRIMARY_SOURCE_COUNT=${primaryUse.size}`);
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

for (const item of [...technicalIssues, ...creativeIssues]) {
  console.log(`AUDIT_${item.severity}=${item.code}|${item.path}|${item.message}`);
}

if (technicalReadiness === "FAIL") process.exitCode = 2;
