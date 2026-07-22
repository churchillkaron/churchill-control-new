const ROUNDING = 10;
const MAX_SHOT_DURATION_SECONDS = 15;

function round(value) {
  return Math.round(Number(value || 0) * ROUNDING) / ROUNDING;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function hasText(value) {
  return Boolean(String(value || "").trim());
}

function hasObjectValues(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length,
  );
}

function requiredStoryBeats(brief = {}) {
  const specifications = brief.specifications || {};
  const candidates = [
    brief.required_story_beats,
    brief.scene_plan,
    brief.structure,
    specifications.required_story_beats,
    specifications.scene_plan,
    specifications.structure,
  ];

  return candidates
    .find((value) => Array.isArray(value))
    ?.map((value) => String(value || "").trim())
    .filter(Boolean) || [];
}

function significantTerms(value = "") {
  const stop = new Set([
    "the", "and", "with", "from", "into", "for", "this", "that",
    "scene", "shot", "seconds", "second", "film", "video", "master",
    "cinematic", "campaign",
  ]);

  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !stop.has(term));
}

function planText(plan = {}) {
  return JSON.stringify(plan).toLowerCase();
}

function visualAssets(assets = []) {
  return assets.filter((asset) => {
    if (!asset?.id) return false;
    const description = [
      asset.asset_type,
      asset.mime_type,
      asset.metadata?.mime_type,
      asset.file_name,
      asset.file_url,
      asset.image_url,
      asset.url,
    ].filter(Boolean).join(" ").toLowerCase();

    if (
      /audio\//.test(description) ||
      /\.(mp3|wav|aac|m4a|flac)(?:\?|$)/.test(description)
    ) {
      return false;
    }

    return true;
  });
}

function cameraFailures(camera = {}, label) {
  const failures = [];
  const required = [
    "framing",
    "movement",
    "lens",
    "angle",
    "camera_height",
    "start_position",
    "end_position",
    "support",
    "movement_speed",
    "focus_strategy",
    "composition",
    "motivation",
  ];

  if (!hasObjectValues(camera)) {
    failures.push(`${label}: camera contract missing`);
    return failures;
  }

  const missing = required.filter((key) => !hasText(camera[key]));
  if (missing.length) {
    failures.push(`${label}: camera detail missing ${missing.join(", ")}`);
  }

  return failures;
}

function lightingFailures(lighting = {}, label) {
  const failures = [];
  const required = [
    "motivation",
    "source_positions",
    "key_fill_edge",
    "color_temperature",
    "exposure_hierarchy",
    "contrast",
    "continuity",
  ];

  if (!hasObjectValues(lighting)) {
    failures.push(`${label}: lighting contract missing`);
    return failures;
  }

  const missing = required.filter((key) => !lighting[key] || (
    typeof lighting[key] === "string" && !hasText(lighting[key])
  ));
  if (missing.length) {
    failures.push(`${label}: lighting detail missing ${missing.join(", ")}`);
  }

  return failures;
}

function referenceFailures(shot = {}, label, assetsAvailable) {
  const failures = [];
  const pack = object(shot.reference_pack);
  const continuity = object(shot.continuity);

  if (!hasObjectValues(pack)) {
    failures.push(`${label}: reference pack missing`);
  }
  if (!list(pack.preserve).length) {
    failures.push(`${label}: reference preserve rules missing`);
  }
  if (!list(pack.never_change).length) {
    failures.push(`${label}: reference never-change rules missing`);
  }
  if (!list(pack.may_change).length && !pack.may_change_reason) {
    failures.push(`${label}: reference may-change boundaries missing`);
  }
  if (!hasObjectValues(continuity)) {
    failures.push(`${label}: continuity contract missing`);
  }
  if (!list(continuity.locks).length) {
    failures.push(`${label}: continuity locks missing`);
  }
  if (!hasText(continuity.entering)) {
    failures.push(`${label}: continuity entering state missing`);
  }
  if (!hasText(continuity.leaving)) {
    failures.push(`${label}: continuity leaving state missing`);
  }
  if (
    assetsAvailable &&
    !list(shot.reference_asset_ids).length
  ) {
    failures.push(`${label}: no canonical reference asset selected`);
  }

  return failures;
}

function physicalRealityFailures(shot = {}, label) {
  const failures = [];
  const rules = object(shot.reality_rules);

  if (!hasObjectValues(rules)) {
    failures.push(`${label}: physical reality rules missing`);
    return failures;
  }

  const categories = [
    "human",
    "physical",
    "environment",
  ];
  const missing = categories.filter((key) => !list(rules[key]).length);
  if (missing.length) {
    failures.push(`${label}: physical reality categories missing ${missing.join(", ")}`);
  }

  return failures;
}

function soundAndEditFailures(shot = {}, label) {
  const failures = [];

  if (!hasObjectValues(shot.transition_in)) {
    failures.push(`${label}: transition-in direction missing`);
  }
  if (!hasObjectValues(shot.transition_out)) {
    failures.push(`${label}: transition-out direction missing`);
  }
  if (
    !hasObjectValues(shot.music) &&
    !list(shot.sound_effects).length &&
    !list(shot.dialogue).length &&
    !hasObjectValues(shot.narration)
  ) {
    failures.push(`${label}: sound direction missing`);
  }
  if (!hasObjectValues(shot.post_production)) {
    failures.push(`${label}: post-production ownership missing`);
  }

  return failures;
}

function performanceFailures(shot = {}, label) {
  const failures = [];

  if (!hasText(shot.performance_direction)) {
    failures.push(`${label}: performance direction missing`);
  }
  if (!list(shot.action_beats).length) {
    failures.push(`${label}: action beats missing`);
  }

  const actors = list(shot.actors);
  for (const [index, actor] of actors.entries()) {
    const actorLabel = `${label} actor ${index + 1}`;
    const required = [
      actor.starting_position,
      actor.movement_path,
      actor.eye_line,
      actor.gesture,
      actor.reaction_timing,
      actor.object_contact,
    ];
    if (required.some((value) => !hasText(value))) {
      failures.push(`${actorLabel}: blocking or behavior incomplete`);
    }
  }

  return failures;
}

function shotFailures(shot = {}, sceneNumber, shotNumber, assetsAvailable) {
  const failures = [];
  const label = `scene ${sceneNumber} shot ${shotNumber}`;
  const duration = Number(shot.duration_seconds || 0);

  if (!hasText(shot.title)) failures.push(`${label}: title missing`);
  if (!hasText(shot.purpose)) failures.push(`${label}: purpose missing`);
  if (!hasText(shot.opening_frame)) failures.push(`${label}: opening frame missing`);
  if (!hasText(shot.closing_frame)) failures.push(`${label}: closing frame missing`);
  if (duration <= 0 || duration > MAX_SHOT_DURATION_SECONDS) {
    failures.push(`${label}: duration outside 0-${MAX_SHOT_DURATION_SECONDS}s`);
  }

  failures.push(
    ...cameraFailures(object(shot.camera), label),
    ...lightingFailures(object(shot.lighting), label),
    ...performanceFailures(shot, label),
    ...referenceFailures(shot, label, assetsAvailable),
    ...physicalRealityFailures(shot, label),
    ...soundAndEditFailures(shot, label),
  );

  if (!list(shot.negative_constraints).length) {
    failures.push(`${label}: shot-specific failure prevention missing`);
  }
  if (!hasObjectValues(shot.quality_requirements)) {
    failures.push(`${label}: measurable quality requirements missing`);
  }

  return failures;
}

function normalizeNumbers(plan = {}) {
  const output = clone(plan) || {};
  output.scenes = list(output.scenes).map((scene, sceneIndex) => ({
    ...scene,
    scene_number: sceneIndex + 1,
    shots: list(scene.shots).map((shot, shotIndex) => ({
      ...shot,
      shot_number: shotIndex + 1,
      reference_asset_ids: list(shot.reference_asset_ids).map(String),
      assets: list(shot.reference_asset_ids).map(String),
    })),
  }));
  return output;
}

export function inspectCreativeStoryboardPlan({
  creativePlan,
  targetDuration,
  brief = {},
  assets = [],
} = {}) {
  const target = Number(targetDuration || 30);
  const plan = normalizeNumbers(creativePlan);
  const scenes = list(plan.scenes);
  const shots = scenes.flatMap((scene) => list(scene.shots));
  const failures = [];
  const warnings = [];
  const assetIds = new Set(visualAssets(assets).map((asset) => String(asset.id)));
  const sceneTitles = new Set();
  const shotTitles = new Set();
  const referencedShots = [];
  const selectedAssetIds = new Set();

  if (!scenes.length) failures.push("production bible has no scenes");
  if (!shots.length) failures.push("production bible has no shots");

  for (const [sceneIndex, scene] of scenes.entries()) {
    const sceneNumber = sceneIndex + 1;
    const title = String(scene.title || "").trim().toLowerCase();
    const sceneShots = list(scene.shots);

    if (!title) failures.push(`scene ${sceneNumber}: title missing`);
    if (title && sceneTitles.has(title)) failures.push(`scene ${sceneNumber}: duplicate title`);
    if (title) sceneTitles.add(title);
    if (!hasText(scene.objective)) failures.push(`scene ${sceneNumber}: objective missing`);
    if (!hasText(scene.emotion)) failures.push(`scene ${sceneNumber}: emotional function missing`);
    if (!sceneShots.length) failures.push(`scene ${sceneNumber}: no shots`);

    const sceneDuration = round(
      sceneShots.reduce(
        (total, shot) => total + Number(shot.duration_seconds || 0),
        0,
      ),
    );
    if (Math.abs(sceneDuration - Number(scene.duration_seconds || 0)) > 0.1) {
      failures.push(`scene ${sceneNumber}: scene duration does not equal shot duration`);
    }

    for (const [shotIndex, shot] of sceneShots.entries()) {
      const shotNumber = shotIndex + 1;
      const label = `scene ${sceneNumber} shot ${shotNumber}`;
      failures.push(
        ...shotFailures(
          shot,
          sceneNumber,
          shotNumber,
          assetIds.size > 0,
        ),
      );

      const shotTitle = String(shot.title || "").trim().toLowerCase();
      if (shotTitle && shotTitles.has(shotTitle)) {
        failures.push(`${label}: duplicate title`);
      }
      if (shotTitle) shotTitles.add(shotTitle);

      const references = list(shot.reference_asset_ids).map(String);
      if (references.length) referencedShots.push(label);
      for (const id of references) {
        selectedAssetIds.add(id);
        if (!assetIds.has(id)) {
          failures.push(`${label}: unknown reference asset ${id}`);
        }
      }
    }
  }

  const totalDuration = round(
    shots.reduce(
      (total, shot) => total + Number(shot.duration_seconds || 0),
      0,
    ),
  );
  if (Math.abs(totalDuration - target) > 0.1) {
    failures.push(`total shot duration ${totalDuration}s does not equal target ${target}s`);
  }

  const beats = requiredStoryBeats(brief);
  const searchable = planText(plan);
  const missingBeats = beats.filter((beat) => {
    const terms = significantTerms(beat);
    return terms.length && !terms.some((term) => searchable.includes(term));
  });
  if (missingBeats.length) {
    failures.push(`required story beats missing: ${missingBeats.join(" | ")}`);
  }

  const referenceCoverage = shots.length
    ? referencedShots.length / shots.length
    : 0;
  if (assetIds.size && referenceCoverage < 0.8) {
    failures.push(
      `reference coverage ${Math.round(referenceCoverage * 100)}% is below 80%`,
    );
  }
  if (assetIds.size >= 3 && selectedAssetIds.size < 3) {
    warnings.push("fewer than three distinct canonical references selected");
  }

  const report = {
    passed: failures.length === 0,
    target_duration_seconds: target,
    total_duration_seconds: totalDuration,
    scene_count: scenes.length,
    scene_count_policy: "DYNAMIC_STORY_DECISION",
    shot_count: shots.length,
    shot_count_policy: "DYNAMIC_STORY_AND_EDIT_DECISION",
    referenced_shots: referencedShots.length,
    reference_coverage_percent: Math.round(referenceCoverage * 100),
    distinct_reference_assets: selectedAssetIds.size,
    required_story_beats: beats,
    missing_story_beats: missingBeats,
    failures,
    warnings,
  };

  return {
    creativePlan: plan,
    report,
  };
}

export function enforceCreativeStoryboardPlan(input = {}) {
  const result = inspectCreativeStoryboardPlan(input);

  if (!result.report.passed) {
    const error = new Error("CREATIVE_STORYBOARD_PLAN_REJECTED");
    error.code = "CREATIVE_STORYBOARD_PLAN_REJECTED";
    error.details = result.report;
    throw error;
  }

  return result;
}
