const ROUNDING = 10;
const MIN_SHOTS_PER_SCENE = 2;
const MAX_SHOT_DURATION_SECONDS = 10;
const REFERENCES_PER_SHOT = 3;

function round(value) {
  return Math.round(Number(value || 0) * ROUNDING) / ROUNDING;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value || 0)));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function minimumSceneCount(durationSeconds) {
  const duration = Number(durationSeconds || 30);
  if (duration <= 15) return 3;
  if (duration <= 30) return 5;
  if (duration <= 60) return 8;
  return 12;
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
    "cinematic", "campaign", "churchill", "bar", "restaurant",
  ]);

  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !stop.has(term));
}

function expandedTerms(value = "") {
  const terms = new Set(significantTerms(value));
  const text = String(value).toLowerCase();
  const groups = [
    [/(exterior|arrival|entrance|facade|outside)/, ["exterior", "entrance", "facade", "sign", "door", "arrival"]],
    [/(bartender|flair|fire|flame)/, ["bartender", "bar", "cocktail", "shaker", "fire", "flame"]],
    [/(cocktail|drink|glass|bottle)/, ["cocktail", "drink", "glass", "bottle", "bar"]],
    [/(dj|booth|mixer|deck)/, ["dj", "booth", "mixer", "deck", "music"]],
    [/(crowd|dance|dancefloor|nightlife)/, ["crowd", "dance", "people", "nightlife", "club"]],
    [/(smoke|lighting|lights|laser)/, ["smoke", "light", "lighting", "laser", "club"]],
    [/(logo|cta|handle|invitation|brand)/, ["logo", "brand", "sign", "handle", "identity"]],
  ];

  for (const [pattern, additions] of groups) {
    if (pattern.test(text)) additions.forEach((term) => terms.add(term));
  }

  return [...terms];
}

function planText(plan = {}) {
  return JSON.stringify(
    (plan.scenes || []).map((scene) => ({
      title: scene.title,
      objective: scene.objective,
      emotion: scene.emotion,
      shots: (scene.shots || []).map((shot) => ({
        title: shot.title,
        purpose: shot.purpose,
        opening_frame: shot.opening_frame,
        closing_frame: shot.closing_frame,
        action_beats: shot.action_beats,
      })),
    })),
  ).toLowerCase();
}

function visualAssets(assets = []) {
  return assets.filter((asset) => {
    if (!asset?.id) return false;
    const text = [
      asset.asset_type,
      asset.mime_type,
      asset.metadata?.mime_type,
      asset.file_name,
      asset.file_url,
      asset.image_url,
      asset.url,
    ].filter(Boolean).join(" ").toLowerCase();

    if (/audio\//.test(text) || /\.(mp3|wav|aac|m4a|flac)(?:\?|$)/.test(text)) return false;
    return true;
  });
}

function assetText(asset = {}) {
  return [
    asset.name,
    asset.title,
    asset.file_name,
    asset.description,
    asset.asset_type,
    ...(Array.isArray(asset.tags) ? asset.tags : []),
    JSON.stringify(asset.analysis || {}),
    JSON.stringify(asset.metadata || {}),
  ].filter(Boolean).join(" ").toLowerCase();
}

function selectReferences({ assets, scene, shot, sceneIndex, shotIndex }) {
  const available = visualAssets(assets);
  if (!available.length) return [];

  const terms = expandedTerms([
    scene.title,
    scene.objective,
    scene.emotion,
    shot.title,
    shot.purpose,
    shot.opening_frame,
    shot.closing_frame,
  ].filter(Boolean).join(" "));

  const scored = available.map((asset, index) => {
    const text = assetText(asset);
    const score = terms.reduce(
      (total, term) => total + (text.includes(term) ? 1 : 0),
      0,
    );
    return { asset, index, score };
  });

  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const offset = sceneIndex * MIN_SHOTS_PER_SCENE + shotIndex;
    const leftDistance = (left.index - offset + available.length) % available.length;
    const rightDistance = (right.index - offset + available.length) % available.length;
    return leftDistance - rightDistance;
  });

  return scored
    .slice(0, Math.min(REFERENCES_PER_SHOT, scored.length))
    .map(({ asset }) => String(asset.id));
}

function ensureActionBeats(shot = {}) {
  const duration = clamp(shot.duration_seconds || 3, 1, MAX_SHOT_DURATION_SECONDS);
  const existing = Array.isArray(shot.action_beats)
    ? shot.action_beats.filter(Boolean)
    : [];

  if (existing.length >= 2) return existing;

  return [
    existing[0] || {
      at_seconds: 0,
      action: "Begin the directed action from a stable, readable opening frame.",
    },
    {
      at_seconds: Math.max(1, round(duration - 0.8)),
      action: "Complete the action on a clean emotional or product payoff that motivates the next cut.",
    },
  ];
}

function complementaryShot(scene = {}, sourceShot = {}, sceneNumber) {
  const duration = Math.max(1, Number(sourceShot.duration_seconds || scene.duration_seconds || 4) / 2);
  const sceneTitle = String(scene.title || `Scene ${sceneNumber}`).trim();

  return {
    ...clone(sourceShot),
    shot_number: 2,
    title: `${sceneTitle} — Detail & Payoff`,
    purpose: `Reveal the tactile detail, human reaction, product truth, or emotional payoff that completes ${sceneTitle}.`,
    duration_seconds: duration,
    opening_frame: sourceShot.closing_frame || `Cut to a precise detail or reaction within ${sceneTitle}.`,
    closing_frame: `Resolve ${sceneTitle} on a memorable, editorially clean payoff frame.`,
    action_beats: [
      {
        at_seconds: 0,
        action: "Enter on a motivated detail, reaction, or product action that continues the previous shot.",
      },
      {
        at_seconds: Math.max(1, round(duration - 0.8)),
        action: "Land the scene payoff with stable identity, product state, eye line, and screen direction.",
      },
    ],
    performance_direction: sourceShot.performance_direction ||
      "Direct restrained micro-reactions, believable hand contact, stable eye lines, and precise timing around the scene payoff.",
    camera: {
      ...(sourceShot.camera || {}),
      framing: "Close-up or medium close-up",
      movement: "Subtle motivated push, lateral reveal, or locked detail",
      lens: "65mm",
      angle: sourceShot.camera?.angle || "Natural eye level",
      focus: "Hold the decisive tactile detail, face reaction, product, or brand cue in precise focus",
    },
    transition_in: {
      type: "motivated_cut",
      continuity: "Match action, eye line, screen direction, product state, and practical-light direction.",
    },
    transition_out: {
      type: "editorial_payoff_cut",
      continuity: "Leave a clean closing frame that motivates the following scene.",
    },
    reference_asset_ids: [],
  };
}

function convergeShotStructure(plan = {}, assets = []) {
  const output = clone(plan) || {};
  const scenes = Array.isArray(output.scenes) ? output.scenes : [];

  output.scenes = scenes.map((scene, sceneIndex) => {
    const sceneNumber = sceneIndex + 1;
    let shots = Array.isArray(scene.shots)
      ? scene.shots.filter(Boolean).map((shot) => ({ ...shot }))
      : [];

    if (shots.length === 1) {
      const originalDuration = Math.max(2, Number(shots[0].duration_seconds || scene.duration_seconds || 4));
      shots[0].duration_seconds = round(originalDuration / 2);
      shots.push(complementaryShot(scene, shots[0], sceneNumber));
    }

    shots = shots.map((shot, shotIndex) => {
      const existingReferences = Array.isArray(shot.reference_asset_ids)
        ? shot.reference_asset_ids.filter(Boolean).map(String)
        : [];
      const references = existingReferences.length
        ? existingReferences
        : selectReferences({ assets, scene, shot, sceneIndex, shotIndex });

      return {
        ...shot,
        shot_number: shotIndex + 1,
        action_beats: ensureActionBeats(shot),
        reference_asset_ids: references,
        assets: references,
        metadata: {
          ...(shot.metadata || {}),
          reference_selection_source: existingReferences.length
            ? "AI_DIRECTOR"
            : references.length
              ? "SEMANTIC_ASSET_MATCH"
              : "NONE",
        },
      };
    });

    return {
      ...scene,
      scene_number: sceneNumber,
      shots,
    };
  });

  return output;
}

function convergeDurations(plan = {}, targetDuration = 30) {
  const output = clone(plan) || {};
  const scenes = Array.isArray(output.scenes) ? output.scenes : [];
  const shots = scenes.flatMap((scene) => Array.isArray(scene.shots) ? scene.shots : []);
  const target = round(Number(targetDuration || 30));

  if (!shots.length) return output;

  const minimumTotal = shots.length;
  const maximumTotal = shots.length * MAX_SHOT_DURATION_SECONDS;
  if (target < minimumTotal || target > maximumTotal) {
    const error = new Error("CREATIVE_STORYBOARD_DURATION_CAPACITY_INVALID");
    error.details = {
      target_duration: target,
      shot_count: shots.length,
      minimum_duration: minimumTotal,
      maximum_duration: maximumTotal,
    };
    throw error;
  }

  const raw = shots.map((shot) => clamp(shot.duration_seconds || 3, 1, MAX_SHOT_DURATION_SECONDS));
  const rawTotal = raw.reduce((sum, value) => sum + value, 0) || shots.length;
  const scaled = raw.map((value) => round(clamp(value * target / rawTotal, 1, MAX_SHOT_DURATION_SECONDS)));
  let difference = round(target - scaled.reduce((sum, value) => sum + value, 0));
  let guard = 0;

  while (Math.abs(difference) >= 0.1 && guard < 10000) {
    guard += 1;
    const direction = difference > 0 ? 0.1 : -0.1;
    let changed = false;

    for (let index = 0; index < scaled.length && Math.abs(difference) >= 0.1; index += 1) {
      const candidate = round(scaled[index] + direction);
      if (candidate < 1 || candidate > MAX_SHOT_DURATION_SECONDS) continue;
      scaled[index] = candidate;
      difference = round(difference - direction);
      changed = true;
    }

    if (!changed) break;
  }

  let cursor = 0;
  for (const scene of scenes) {
    const sceneShots = Array.isArray(scene.shots) ? scene.shots : [];
    for (const shot of sceneShots) {
      shot.duration_seconds = scaled[cursor];
      shot.action_beats = ensureActionBeats(shot);
      cursor += 1;
    }
    scene.duration_seconds = round(
      sceneShots.reduce((sum, shot) => sum + Number(shot.duration_seconds || 0), 0),
    );
  }

  return output;
}

function hasObjectValues(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length);
}

function shotFailures(shot = {}, sceneNumber, shotNumber, assetsAvailable) {
  const failures = [];
  const label = `scene ${sceneNumber} shot ${shotNumber}`;

  if (!String(shot.title || "").trim()) failures.push(`${label}: title missing`);
  if (!String(shot.purpose || "").trim()) failures.push(`${label}: purpose missing`);
  if (!String(shot.opening_frame || "").trim()) failures.push(`${label}: opening frame missing`);
  if (!String(shot.closing_frame || "").trim()) failures.push(`${label}: closing frame missing`);
  if (!String(shot.performance_direction || "").trim()) failures.push(`${label}: performance direction missing`);
  if (!Array.isArray(shot.action_beats) || shot.action_beats.length < 2) failures.push(`${label}: fewer than two action beats`);
  if (!hasObjectValues(shot.camera)) failures.push(`${label}: camera contract missing`);
  if (!shot.camera?.framing || !shot.camera?.movement || !shot.camera?.lens || !shot.camera?.angle) failures.push(`${label}: camera framing/movement/lens/angle incomplete`);
  if (!hasObjectValues(shot.lighting)) failures.push(`${label}: lighting contract missing`);
  if (!shot.lighting?.continuity) failures.push(`${label}: lighting continuity missing`);
  if (!hasObjectValues(shot.reference_pack)) failures.push(`${label}: reference pack missing`);
  if (!Array.isArray(shot.reference_pack?.preserve) || !shot.reference_pack.preserve.length) failures.push(`${label}: reference preserve rules missing`);
  if (!Array.isArray(shot.reference_pack?.never_change) || !shot.reference_pack.never_change.length) failures.push(`${label}: reference never-change rules missing`);
  if (!hasObjectValues(shot.continuity)) failures.push(`${label}: continuity contract missing`);
  if (!Array.isArray(shot.continuity?.locks) || !shot.continuity.locks.length) failures.push(`${label}: continuity locks missing`);
  if (!hasObjectValues(shot.reality_rules)) failures.push(`${label}: reality rules missing`);
  if (!Array.isArray(shot.negative_constraints) || !shot.negative_constraints.length) failures.push(`${label}: negative constraints missing`);
  if (!hasObjectValues(shot.quality_requirements)) failures.push(`${label}: measurable quality requirements missing`);
  if (Number(shot.duration_seconds || 0) < 1 || Number(shot.duration_seconds || 0) > MAX_SHOT_DURATION_SECONDS) failures.push(`${label}: duration outside 1-${MAX_SHOT_DURATION_SECONDS}s`);

  if (assetsAvailable && (!Array.isArray(shot.reference_asset_ids) || !shot.reference_asset_ids.length)) {
    failures.push(`${label}: no selected reference asset`);
  }

  return failures;
}

function isGenericFallback(plan = {}) {
  const scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  if (!scenes.length) return true;

  return (
    String(plan.title || "").trim() === "Original Commercial Film" &&
    scenes.every((scene, sceneIndex) =>
      String(scene.title || "").trim() === `Scene ${sceneIndex + 1}` &&
      (scene.shots || []).every((shot, shotIndex) =>
        String(shot.title || "").trim() === `Scene ${sceneIndex + 1} Shot ${shotIndex + 1}`,
      ),
    )
  );
}

export function enforceCreativeStoryboardPlan({
  creativePlan,
  targetDuration,
  brief = {},
  assets = [],
} = {}) {
  const target = Number(targetDuration || 30);
  const structuredPlan = convergeShotStructure(creativePlan, assets);
  const plan = convergeDurations(structuredPlan, target);
  const scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  const shots = scenes.flatMap((scene) => Array.isArray(scene.shots) ? scene.shots : []);
  const failures = [];
  const warnings = [];

  if (isGenericFallback(plan)) failures.push("AI shot director returned the deterministic generic fallback");
  if (scenes.length < minimumSceneCount(target)) failures.push(`scene count ${scenes.length} is below ${minimumSceneCount(target)} for ${target}s`);

  const sceneTitles = new Set();
  const shotTitles = new Set();
  let referencedShots = 0;
  const selectedAssetIds = new Set();

  for (const [sceneIndex, scene] of scenes.entries()) {
    const sceneNumber = sceneIndex + 1;
    const sceneShots = Array.isArray(scene.shots) ? scene.shots : [];
    const sceneTitle = String(scene.title || "").trim().toLowerCase();

    if (!sceneTitle) failures.push(`scene ${sceneNumber}: title missing`);
    if (sceneTitles.has(sceneTitle)) failures.push(`scene ${sceneNumber}: duplicate title`);
    sceneTitles.add(sceneTitle);
    if (!String(scene.objective || "").trim()) failures.push(`scene ${sceneNumber}: objective missing`);
    if (!String(scene.emotion || "").trim()) failures.push(`scene ${sceneNumber}: emotion missing`);
    if (sceneShots.length < MIN_SHOTS_PER_SCENE) failures.push(`scene ${sceneNumber}: fewer than ${MIN_SHOTS_PER_SCENE} shots`);

    const sceneShotDuration = round(sceneShots.reduce((sum, shot) => sum + Number(shot.duration_seconds || 0), 0));
    if (Math.abs(sceneShotDuration - Number(scene.duration_seconds || 0)) > 0.1) failures.push(`scene ${sceneNumber}: scene duration does not equal shot duration`);

    for (const [shotIndex, shot] of sceneShots.entries()) {
      failures.push(...shotFailures(shot, sceneNumber, shotIndex + 1, visualAssets(assets).length > 0));
      const title = String(shot.title || "").trim().toLowerCase();
      if (shotTitles.has(title)) failures.push(`scene ${sceneNumber} shot ${shotIndex + 1}: duplicate title`);
      shotTitles.add(title);

      const references = Array.isArray(shot.reference_asset_ids) ? shot.reference_asset_ids.filter(Boolean) : [];
      if (references.length) referencedShots += 1;
      references.forEach((id) => selectedAssetIds.add(String(id)));
    }
  }

  const totalDuration = round(shots.reduce((sum, shot) => sum + Number(shot.duration_seconds || 0), 0));
  if (Math.abs(totalDuration - target) > 0.1) failures.push(`total shot duration ${totalDuration}s does not equal target ${target}s`);

  const beats = requiredStoryBeats(brief);
  const searchable = planText(plan);
  const missingBeats = beats.filter((beat) => {
    const terms = significantTerms(beat);
    return terms.length && !terms.some((term) => searchable.includes(term));
  });
  if (missingBeats.length) failures.push(`required story beats missing: ${missingBeats.join(" | ")}`);

  const referenceCoverage = shots.length ? referencedShots / shots.length : 0;
  if (visualAssets(assets).length && referenceCoverage < 0.8) failures.push(`reference coverage ${Math.round(referenceCoverage * 100)}% is below 80%`);
  if (visualAssets(assets).length >= 3 && selectedAssetIds.size < 3) warnings.push("fewer than three distinct reference assets selected");

  const report = {
    passed: failures.length === 0,
    target_duration_seconds: target,
    total_duration_seconds: totalDuration,
    scene_count: scenes.length,
    minimum_scene_count: minimumSceneCount(target),
    shot_count: shots.length,
    minimum_shots_per_scene: MIN_SHOTS_PER_SCENE,
    referenced_shots: referencedShots,
    reference_coverage_percent: Math.round(referenceCoverage * 100),
    distinct_reference_assets: selectedAssetIds.size,
    required_story_beats: beats,
    missing_story_beats: missingBeats,
    failures,
    warnings,
  };

  if (!report.passed) {
    const error = new Error("CREATIVE_STORYBOARD_PLAN_REJECTED");
    error.code = "CREATIVE_STORYBOARD_PLAN_REJECTED";
    error.details = report;
    throw error;
  }

  return { creativePlan: plan, report };
}
