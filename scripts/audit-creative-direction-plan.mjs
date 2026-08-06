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

function firstText(...values) {
  return values.map(text).find(Boolean) || "";
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
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

function shotDuration(shot = {}) {
  return finite(
    shot.duration_seconds ??
      shot.duration ??
      shot.timing?.duration_seconds ??
      shot.timing?.duration ??
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
  if (durations.every((value) => value !== null)) {
    return durations.reduce((sum, value) => sum + value, 0);
  }
  return null;
}

function generationText(shot = {}) {
  const generation = object(shot.generation);
  return firstText(
    generation.prompt,
    generation.instruction,
    generation.instructions,
    generation.description,
    generation.visual_prompt,
    generation.video_prompt,
    shot.generation_prompt,
    shot.prompt,
    shot.visual_direction,
    shot.direction,
    shot.description,
  );
}

function shotPurpose(shot = {}) {
  return firstText(
    shot.purpose,
    shot.intent,
    shot.story_function,
    shot.narrative_function,
    shot.beat,
    shot.description,
    shot.action,
  );
}

function scenePurpose(scene = {}) {
  return firstText(
    scene.purpose,
    scene.intent,
    scene.story_function,
    scene.narrative_function,
    scene.beat,
    scene.summary,
    scene.description,
    scene.title,
  );
}

function cameraText(shot = {}) {
  const camera = object(shot.camera);
  return firstText(
    camera.movement,
    camera.move,
    camera.motion,
    shot.camera_movement,
    shot.camera_move,
    camera.framing,
    shot.framing,
    camera.shot_size,
    shot.shot_size,
    camera.lens,
    shot.lens,
  );
}

function movementToken(shot = {}) {
  const source = cameraText(shot).toLowerCase();
  const known = [
    "static",
    "locked",
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
  ];
  return known.find((value) => source.includes(value)) || source || "UNSPECIFIED";
}

function scaleToken(shot = {}) {
  const camera = object(shot.camera);
  const source = firstText(
    camera.shot_size,
    camera.framing,
    shot.shot_size,
    shot.framing,
    shot.composition,
  ).toLowerCase();
  const known = [
    "extreme wide",
    "establishing",
    "wide",
    "full body",
    "medium wide",
    "medium",
    "medium close",
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
      (reference) =>
        text(reference?.role).toUpperCase() === "PRIMARY_SOURCE",
    )?.asset_id,
  );
}

function issue(severity, code, pathValue, message, evidence = null) {
  return {
    severity,
    code,
    path: pathValue,
    message,
    evidence,
  };
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
  technicalIssues.push(
    issue("BLOCKER", "SCENES_MISSING", "plan.scenes", "The plan contains no scenes"),
  );
}
if (!shots.length) {
  technicalIssues.push(
    issue("BLOCKER", "SHOTS_MISSING", "plan.scenes", "The plan contains no shots"),
  );
}
if (plan.validation?.passed !== true) {
  technicalIssues.push(
    issue(
      "BLOCKER",
      "PLAN_VALIDATION_NOT_PASSED",
      "plan.validation.passed",
      "The plan does not carry a passed validation result",
      plan.validation || null,
    ),
  );
}

const sceneIds = scenes.map((scene) => text(scene.id)).filter(Boolean);
const shotIds = shots.map(({ shot }) => text(shot.id)).filter(Boolean);
if (sceneIds.length !== scenes.length) {
  technicalIssues.push(
    issue("BLOCKER", "SCENE_ID_MISSING", "plan.scenes", "Every scene needs an ID"),
  );
}
if (new Set(sceneIds).size !== sceneIds.length) {
  technicalIssues.push(
    issue("BLOCKER", "SCENE_ID_DUPLICATE", "plan.scenes", "Scene IDs must be unique"),
  );
}
if (shotIds.length !== shots.length) {
  technicalIssues.push(
    issue("BLOCKER", "SHOT_ID_MISSING", "plan.scenes.*.shots", "Every shot needs an ID"),
  );
}
if (new Set(shotIds).size !== shotIds.length) {
  technicalIssues.push(
    issue("BLOCKER", "SHOT_ID_DUPLICATE", "plan.scenes.*.shots", "Shot IDs must be unique"),
  );
}

let calculatedDuration = 0;
let durationKnown = true;
const primaryUse = new Map();
const cameraMovements = [];
const shotScales = [];
const allGenerationText = [];
const allPurposes = [];

for (const [sceneIndex, scene] of scenes.entries()) {
  const sceneShots = list(scene.shots);
  const purpose = scenePurpose(scene);
  const duration = sceneDuration(scene);
  if (!purpose) {
    creativeIssues.push(
      issue(
        "WARNING",
        "SCENE_PURPOSE_MISSING",
        `plan.scenes.${sceneIndex}`,
        "The scene has no explicit story function or purpose",
      ),
    );
  }
  if (!sceneShots.length) {
    technicalIssues.push(
      issue(
        "BLOCKER",
        "SCENE_WITHOUT_SHOTS",
        `plan.scenes.${sceneIndex}.shots`,
        "Every scene must contain at least one shot",
      ),
    );
  }
  if (duration === null || duration <= 0) {
    durationKnown = false;
    technicalIssues.push(
      issue(
        "WARNING",
        "SCENE_DURATION_UNRESOLVED",
        `plan.scenes.${sceneIndex}`,
        "Scene duration cannot be resolved from scene or shot timing",
      ),
    );
  }
  sceneSummaries.push({
    id: text(scene.id) || `scene-${sceneIndex + 1}`,
    title: firstText(scene.title, scene.name),
    purpose,
    duration_seconds: duration,
    shot_count: sceneShots.length,
  });
}

for (const entry of shots) {
  const { shot, sceneIndex, shotIndex, path: shotPath } = entry;
  const duration = shotDuration(shot);
  const purpose = shotPurpose(shot);
  const prompt = generationText(shot);
  const camera = cameraText(shot);
  const movement = movementToken(shot);
  const scale = scaleToken(shot);
  const primary = primarySourceId(shot);
  const medium = firstText(shot.medium, shot.production_method, shot.generation?.medium);
  const references = list(shot.reference_assets);

  if (duration === null || duration <= 0) {
    technicalIssues.push(
      issue(
        "BLOCKER",
        "SHOT_DURATION_INVALID",
        shotPath,
        "Every shot must have a positive duration",
        duration,
      ),
    );
    durationKnown = false;
  } else {
    calculatedDuration += duration;
    if (duration > 12) {
      creativeIssues.push(
        issue(
          "WARNING",
          "SHOT_DURATION_LONG",
          shotPath,
          "A single shot longer than 12 seconds needs a deliberate internal progression",
          duration,
        ),
      );
    }
  }

  if (!purpose) {
    creativeIssues.push(
      issue(
        "BLOCKER",
        "SHOT_PURPOSE_MISSING",
        shotPath,
        "The shot has no explicit narrative or commercial purpose",
      ),
    );
  } else {
    allPurposes.push({ path: shotPath, value: purpose });
  }

  if (!prompt) {
    technicalIssues.push(
      issue(
        "BLOCKER",
        "GENERATION_DIRECTION_MISSING",
        shotPath,
        "The shot lacks executable generation or visual direction",
      ),
    );
  } else {
    allGenerationText.push({ path: shotPath, value: prompt });
    if (prompt.length < 80) {
      creativeIssues.push(
        issue(
          "WARNING",
          "GENERATION_DIRECTION_THIN",
          shotPath,
          "Generation direction is unusually short for controlled production",
          prompt.length,
        ),
      );
    }
    if (prompt.length > 1800) {
      creativeIssues.push(
        issue(
          "WARNING",
          "GENERATION_DIRECTION_OVERLOADED",
          shotPath,
          "Generation direction may be too overloaded for reliable execution",
          prompt.length,
        ),
      );
    }
  }

  if (!camera) {
    creativeIssues.push(
      issue(
        "WARNING",
        "CAMERA_DIRECTION_MISSING",
        shotPath,
        "The shot lacks explicit framing, lens, or camera movement",
      ),
    );
  }

  const sourceBinding = firstText(
    shot.generation?.source_binding_contract,
    shot.metadata?.source_binding_contract,
  );
  const sourceBearing = Boolean(
    primary ||
      references.length ||
      ["LIVE-ASSET", "ASSET-LED-MOTION"].includes(
        text(medium).toUpperCase().replaceAll("_", "-"),
      ),
  );
  if (sourceBearing && !primary) {
    technicalIssues.push(
      issue(
        "BLOCKER",
        "PRIMARY_SOURCE_MISSING",
        shotPath,
        "A source-bearing shot does not resolve to one primary source",
      ),
    );
  }
  if (primary && !sourceBinding) {
    technicalIssues.push(
      issue(
        "WARNING",
        "SOURCE_BINDING_CONTRACT_MISSING",
        shotPath,
        "Primary source exists but the source binding contract is absent",
        primary,
      ),
    );
  }

  if (primary) {
    primaryUse.set(primary, (primaryUse.get(primary) || 0) + 1);
  }
  cameraMovements.push(movement);
  shotScales.push(scale);

  shotSummaries.push({
    scene_id: text(entry.scene.id) || `scene-${sceneIndex + 1}`,
    shot_id: text(shot.id) || `shot-${sceneIndex + 1}-${shotIndex + 1}`,
    purpose,
    duration_seconds: duration,
    medium,
    primary_source_asset_id: primary || null,
    camera,
    movement,
    scale,
    generation_direction_characters: prompt.length,
  });
}

for (let index = 0; index < allGenerationText.length; index += 1) {
  for (let other = index + 1; other < allGenerationText.length; other += 1) {
    const similarity = jaccard(
      allGenerationText[index].value,
      allGenerationText[other].value,
    );
    if (similarity >= 0.78) {
      creativeIssues.push(
        issue(
          "WARNING",
          "GENERATION_DIRECTION_REPETITIVE",
          allGenerationText[other].path,
          "Two shot directions are highly similar and may produce repetitive footage",
          {
            compared_with: allGenerationText[index].path,
            similarity: Number(similarity.toFixed(3)),
          },
        ),
      );
    }
  }
}

for (let index = 0; index < allPurposes.length; index += 1) {
  for (let other = index + 1; other < allPurposes.length; other += 1) {
    const similarity = jaccard(allPurposes[index].value, allPurposes[other].value);
    if (similarity >= 0.88) {
      creativeIssues.push(
        issue(
          "WARNING",
          "SHOT_PURPOSE_REPETITIVE",
          allPurposes[other].path,
          "Multiple shots appear to serve nearly the same purpose",
          {
            compared_with: allPurposes[index].path,
            similarity: Number(similarity.toFixed(3)),
          },
        ),
      );
    }
  }
}

const movementDiversity = unique(cameraMovements.filter((value) => value !== "UNSPECIFIED"));
const scaleDiversity = unique(shotScales.filter((value) => value !== "UNSPECIFIED"));
if (shots.length >= 8 && movementDiversity.length < 3) {
  creativeIssues.push(
    issue(
      "WARNING",
      "CAMERA_MOVEMENT_VARIETY_LOW",
      "plan.scenes.*.shots.*.camera",
      "The camera movement vocabulary is too narrow for a premium short film",
      movementDiversity,
    ),
  );
}
if (shots.length >= 8 && scaleDiversity.length < 4) {
  creativeIssues.push(
    issue(
      "WARNING",
      "SHOT_SCALE_VARIETY_LOW",
      "plan.scenes.*.shots.*.camera",
      "The framing progression lacks sufficient shot-scale variety",
      scaleDiversity,
    ),
  );
}

const dominantAsset = [...primaryUse.entries()].sort((a, b) => b[1] - a[1])[0] || null;
if (dominantAsset && shots.length >= 6) {
  const ratio = dominantAsset[1] / shots.length;
  if (ratio > 0.62) {
    creativeIssues.push(
      issue(
        "WARNING",
        "PRIMARY_ASSET_OVERUSED",
        "plan.scenes.*.shots.*.primary_source_asset_id",
        "One source asset dominates the film and may make it feel like a slideshow",
        {
          asset_id: dominantAsset[0],
          shot_count: dominantAsset[1],
          ratio: Number(ratio.toFixed(3)),
        },
      ),
    );
  }
}

const firstSceneText = [
  scenePurpose(scenes[0]),
  ...list(scenes[0]?.shots).map((shot) => `${shotPurpose(shot)} ${generationText(shot)}`),
].join(" ").toLowerCase();
const finalSceneText = [
  scenePurpose(scenes.at(-1)),
  ...list(scenes.at(-1)?.shots).map((shot) => `${shotPurpose(shot)} ${generationText(shot)}`),
].join(" ").toLowerCase();

if (scenes.length && !/hook|reveal|intrigue|arrival|impact|question|surprise|tension|immediate|bold|cold open|attention/.test(firstSceneText)) {
  creativeIssues.push(
    issue(
      "WARNING",
      "OPENING_HOOK_NOT_EXPLICIT",
      "plan.scenes.0",
      "The opening does not explicitly state its attention mechanism",
    ),
  );
}
if (scenes.length && !/resolve|payoff|final|logo|brand|invitation|cta|call to action|memory|linger|closure|signature|end card/.test(finalSceneText)) {
  creativeIssues.push(
    issue(
      "WARNING",
      "ENDING_PAYOFF_NOT_EXPLICIT",
      `plan.scenes.${Math.max(0, scenes.length - 1)}`,
      "The ending does not explicitly state its payoff, closure, or brand memory",
    ),
  );
}

const fullPlanText = JSON.stringify(plan).toLowerCase();
if (!/music|sound|audio|rhythm|beat|sfx|soundtrack|sonic/.test(fullPlanText)) {
  creativeIssues.push(
    issue(
      "WARNING",
      "SOUND_DIRECTION_MISSING",
      "plan",
      "No explicit sound, rhythm, or soundtrack direction was detected",
    ),
  );
}
if (!/transition|cut|match cut|smash cut|dissolve|whip|wipe|bridge|montage/.test(fullPlanText)) {
  creativeIssues.push(
    issue(
      "WARNING",
      "EDIT_TRANSITION_LANGUAGE_MISSING",
      "plan",
      "No explicit editing or transition language was detected",
    ),
  );
}

const technicalBlockers = technicalIssues.filter((item) => item.severity === "BLOCKER");
const technicalWarnings = technicalIssues.filter((item) => item.severity === "WARNING");
const creativeBlockers = creativeIssues.filter((item) => item.severity === "BLOCKER");
const creativeWarnings = creativeIssues.filter((item) => item.severity === "WARNING");

const technicalScore = Math.max(
  0,
  100 - technicalBlockers.length * 25 - technicalWarnings.length * 5,
);
const creativeScore = Math.max(
  0,
  100 - creativeBlockers.length * 18 - creativeWarnings.length * 4,
);
const technicalReadiness = technicalBlockers.length
  ? "FAIL"
  : technicalScore >= 85
    ? "PASS"
    : "WARN";
const worldClassReadiness = creativeBlockers.length
  ? "FAIL"
  : creativeScore >= 85
    ? "PASS"
    : creativeScore >= 65
      ? "WARN"
      : "FAIL";
const recommendation =
  technicalReadiness === "PASS" && worldClassReadiness === "PASS"
    ? "READY_FOR_PRODUCTION_COST_ESTIMATE"
    : "HOLD_PRODUCTION_FOR_DIRECTION_REVIEW";

const report = {
  contract: "CREATIVE_DIRECTION_QUALITY_AUDIT_V1",
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
    technical_score: technicalScore,
    creative_score: creativeScore,
    technical_readiness: technicalReadiness,
    world_class_readiness: worldClassReadiness,
    recommendation,
    technical_blocker_count: technicalBlockers.length,
    technical_warning_count: technicalWarnings.length,
    creative_blocker_count: creativeBlockers.length,
    creative_warning_count: creativeWarnings.length,
    movement_diversity: movementDiversity,
    shot_scale_diversity: scaleDiversity,
    unique_primary_source_count: primaryUse.size,
  },
  technical_issues: technicalIssues,
  creative_issues: creativeIssues,
  scenes: sceneSummaries,
  shots: shotSummaries,
};

const outputPath = path.resolve(
  text(process.env.AUDIT_OUTPUT) ||
    `${inputPath.replace(/\.json$/i, "")}.quality-audit.json`,
);
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY CREATIVE DIRECTION QUALITY AUDIT");
console.log("============================================================");
console.log(`INPUT=${inputPath}`);
console.log(`AUDIT_OUTPUT=${outputPath}`);
console.log(`SCENE_COUNT=${scenes.length}`);
console.log(`SHOT_COUNT=${shots.length}`);
console.log(
  `CALCULATED_DURATION_SECONDS=${
    durationKnown ? Number(calculatedDuration.toFixed(3)) : "UNRESOLVED"
  }`,
);
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
console.log(`UNIQUE_PRIMARY_SOURCE_COUNT=${primaryUse.size}`);
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

for (const item of [...technicalIssues, ...creativeIssues]) {
  console.log(
    `AUDIT_${item.severity}=${item.code}|${item.path}|${item.message}`,
  );
}

if (technicalReadiness === "FAIL") process.exitCode = 2;
