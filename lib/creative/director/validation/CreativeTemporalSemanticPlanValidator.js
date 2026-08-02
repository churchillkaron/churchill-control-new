const STOP_WORDS = new Set([
  "about", "after", "again", "against", "along", "also", "among", "around",
  "because", "before", "being", "between", "both", "camera", "close", "complete",
  "during", "each", "every", "exact", "frame", "from", "further", "guest", "guests",
  "into", "itself", "light", "lighting", "more", "most", "movement", "near", "only",
  "other", "over", "participant", "participants", "passerby", "people", "person",
  "scene", "shot", "show", "shows", "slow", "slowly", "space", "specific", "through",
  "toward", "towards", "under", "until", "very", "visible", "warm", "while", "with",
  "without", "world",
]);

const BEAT_PATTERNS = Object.freeze([
  Object.freeze({
    id: "arrival",
    patterns: [
      /\bapproach\w*\b/i,
      /\barriv\w*\b/i,
      /\benter\w*\b/i,
      /\bentrance\b/i,
      /\bthreshold\b/i,
      /\bdoor\b/i,
      /\bcross\w*\b/i,
      /\bstep\w*\s+(?:inside|into|through)\b/i,
    ],
  }),
  Object.freeze({
    id: "discovery",
    patterns: [
      /\bdiscover\w*\b/i,
      /\bnotice\w*\b/i,
      /\bobser\w*\b/i,
      /\bgaze\w*\b/i,
      /\breveal\w*\b/i,
      /\blook\w*\s+(?:at|toward|towards|inside)\b/i,
    ],
  }),
  Object.freeze({
    id: "service",
    patterns: [
      /\border\w*\b/i,
      /\bserv\w*\b/i,
      /\bprepar\w*\b/i,
      /\bdeliver\w*\b/i,
      /\bpresent\w*\b/i,
      /\battend\w*\b/i,
    ],
  }),
  Object.freeze({
    id: "consumption",
    patterns: [
      /\beat\w*\b/i,
      /\btast\w*\b/i,
      /\bdin\w*\b/i,
      /\bdrink\w*\b/i,
      /\bfood\b/i,
      /\bdish\w*\b/i,
      /\bplate\w*\b/i,
      /\bcocktail\w*\b/i,
      /\bglass\w*\b/i,
    ],
  }),
  Object.freeze({
    id: "play",
    patterns: [
      /\bplay\w*\b/i,
      /\bgame\w*\b/i,
      /\bcompet\w*\b/i,
      /\bscore\w*\b/i,
      /\bpool\b/i,
      /\bshuffleboard\b/i,
      /\bdart\w*\b/i,
    ],
  }),
  Object.freeze({
    id: "performance",
    patterns: [
      /\bperform\w*\b/i,
      /\bband\b/i,
      /\bstage\b/i,
      /\blive\s+music\b/i,
      /\bsing\w*\b/i,
      /\bdanc\w*\b/i,
      /\bchorus\b/i,
    ],
  }),
  Object.freeze({
    id: "connection",
    patterns: [
      /\bconnect\w*\b/i,
      /\bmingle\w*\b/i,
      /\bsocial\w*\b/i,
      /\bshare\w*\b/i,
      /\blaugh\w*\b/i,
      /\bsmil\w*\b/i,
      /\bclink\w*\b/i,
      /\btogether\b/i,
      /\bgroup\w*\b/i,
      /\bcrowd\b/i,
    ],
  }),
  Object.freeze({
    id: "celebration",
    patterns: [
      /\bcelebrat\w*\b/i,
      /\bcheer\w*\b/i,
      /\bclap\w*\b/i,
      /\bjoy\w*\b/i,
      /\bapplau\w*\b/i,
      /\braise\w*\s+(?:hands?|glasses?)\b/i,
      /\bemotional\s+peak\b/i,
    ],
  }),
  Object.freeze({
    id: "closure",
    patterns: [
      /\binvit\w*\b/i,
      /\bjoin\b/i,
      /\bvisit\b/i,
      /\breturn\b/i,
      /\bcall\s+to\s+action\b/i,
      /\bresolve\w*\b/i,
      /\bconclud\w*\b/i,
      /\bfinal\w*\b/i,
      /\bend\s+card\b/i,
    ],
  }),
  Object.freeze({
    id: "brand_reveal",
    patterns: [
      /\blogo\b/i,
      /\bbrand\s+mark\b/i,
      /\btitle\s+card\b/i,
      /\bend\s+card\b/i,
      /\bwebsite\b/i,
      /\burl\b/i,
      /\bsignage\b/i,
    ],
  }),
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

function flattenText(value) {
  if (Array.isArray(value)) return value.map(flattenText).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value).map(flattenText).filter(Boolean).join(" ");
  }
  return text(value);
}

function normalizedWord(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .replace(/(?:ing|edly|edly|ed|es|s)$/i, "")
    .trim();
}

function tokenSet(value) {
  return new Set(
    flattenText(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .map(normalizedWord)
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(word)),
  );
}

function overlapRatio(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / Math.min(a.size, b.size);
}

function beatSet(value) {
  const source = flattenText(value);
  return new Set(
    BEAT_PATTERNS
      .filter((beat) => beat.patterns.some((pattern) => pattern.test(source)))
      .map((beat) => beat.id),
  );
}

function intersectionSize(left, right) {
  return [...left].filter((value) => right.has(value)).length;
}

function sceneExpectation(scene = {}) {
  return [
    scene.title,
    scene.objective,
    scene.story_function,
    scene.state_change,
    scene.story_state_after,
  ];
}

function shotNarrative(shot = {}) {
  return [
    shot.title,
    shot.purpose,
    shot.subject,
    shot.action,
    shot.performance,
  ];
}

function shotFullCorpus(shot = {}) {
  return [
    ...shotNarrative(shot),
    shot.frame_plan,
    shot.graphics,
    shot.transition_in,
    shot.transition_out,
  ];
}

function failure(code, path, message, evidence = null) {
  return { code, path, message, evidence };
}

function expectedDuration(plan = {}) {
  const candidates = [
    plan.production?.target_duration_seconds,
    plan.production?.duration_seconds,
    ...list(plan.deliverables).map((deliverable) =>
      deliverable.output_spec?.duration_seconds,
    ),
  ];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function brandEvidenceRequired(plan = {}) {
  if (list(plan.brand_mark_profiles).length) return true;
  if (plan.production?.deterministic_brand_compositing_required === true) return true;
  if (plan.production?.exact_logo_required === true) return true;

  const manifest = flattenText(plan.asset_manifest).toLowerCase();
  if (/\b(?:logo|brand\s+mark)\b/.test(manifest)) return true;

  return list(plan.scenes)
    .flatMap((scene) => list(scene.shots))
    .some((shot) => Object.keys(object(shot.graphics?.logo)).length > 0);
}

function deterministicBrandClosure(finalScene = {}) {
  return list(finalScene.shots).some((shot) => {
    const graphics = object(shot.graphics);
    const logo = object(graphics.logo);
    const titles = list(graphics.titles);
    const hasBrandElement = Object.keys(logo).length > 0 || titles.length > 0;
    return hasBrandElement && graphics.render_text_outside_generated_pixels === true;
  });
}

function beatCoverageThreshold(size) {
  if (size <= 1) return 1;
  if (size <= 3) return 0.75;
  return 0.6;
}

function primaryBeat(value) {
  const beats = beatSet(value);
  return BEAT_PATTERNS.find((item) => beats.has(item.id))?.id || null;
}

export function validateTemporalSemanticPlan(plan = {}) {
  const normalized = object(plan);
  const workflow = text(normalized.workflow_kind).toUpperCase();
  if (workflow && workflow !== "TEMPORAL") {
    return {
      passed: true,
      workflow_kind: workflow,
      failures: [],
      metrics: { skipped: true },
    };
  }

  const failures = [];
  const scenes = list(normalized.scenes);
  const shots = scenes.flatMap((scene) => list(scene.shots));
  const durationTarget = expectedDuration(normalized);
  const sceneDurationTotal = scenes.reduce(
    (sum, scene) => sum + Number(scene.duration_seconds || 0),
    0,
  );

  if (durationTarget !== null && Math.abs(sceneDurationTotal - durationTarget) > 0.05) {
    failures.push(failure(
      "TEMPORAL_MASTER_DURATION_MISMATCH",
      "scenes",
      "Scene durations must add up to the declared deliverable duration.",
      {
        expected_seconds: durationTarget,
        actual_seconds: Number(sceneDurationTotal.toFixed(6)),
      },
    ));
  }

  const sceneSignatures = [];
  const primaryBeats = [];

  scenes.forEach((scene, sceneIndex) => {
    const sceneShots = list(scene.shots);
    const expectedBeats = beatSet(sceneExpectation(scene));
    const actualBeats = new Set(
      sceneShots.flatMap((shot) => [...beatSet(shotNarrative(shot))]),
    );
    const covered = intersectionSize(expectedBeats, actualBeats);
    const coverage = expectedBeats.size ? covered / expectedBeats.size : 1;
    const threshold = beatCoverageThreshold(expectedBeats.size);

    if (expectedBeats.size && coverage + 1e-9 < threshold) {
      failures.push(failure(
        "SCENE_SHOT_SEMANTIC_COVERAGE_INSUFFICIENT",
        `scenes.${sceneIndex}`,
        "The shots do not execute enough of the scene objective and state change.",
        {
          expected_beats: [...expectedBeats],
          actual_beats: [...actualBeats],
          coverage: Number(coverage.toFixed(4)),
          minimum_coverage: threshold,
        },
      ));
    }

    let mismatchedShots = 0;
    sceneShots.forEach((shot, shotIndex) => {
      const shotBeats = beatSet(shotNarrative(shot));
      const aligned = !expectedBeats.size ||
        !shotBeats.size ||
        intersectionSize(expectedBeats, shotBeats) > 0;
      if (!aligned) mismatchedShots += 1;

      const shotDuration = Number(shot.duration_seconds || 0);
      if (!Number.isFinite(shotDuration) || shotDuration <= 0) {
        failures.push(failure(
          "SEMANTIC_SHOT_DURATION_INVALID",
          `scenes.${sceneIndex}.shots.${shotIndex}.duration_seconds`,
          "Every shot requires a positive duration.",
          shot.duration_seconds,
        ));
      }

      primaryBeats.push({
        scene_index: sceneIndex,
        shot_index: shotIndex,
        beat: primaryBeat(shotNarrative(shot)),
      });
    });

    const allowedMismatch = Math.max(0, Math.floor(sceneShots.length * 0.25));
    if (mismatchedShots > allowedMismatch) {
      failures.push(failure(
        "SCENE_CONTAINS_MISALIGNED_SHOTS",
        `scenes.${sceneIndex}.shots`,
        "Too many shots perform a different story beat than the declared scene.",
        {
          mismatched_shot_count: mismatchedShots,
          shot_count: sceneShots.length,
          allowed_mismatch_count: allowedMismatch,
        },
      ));
    }

    const shotDurationTotal = sceneShots.reduce(
      (sum, shot) => sum + Number(shot.duration_seconds || 0),
      0,
    );
    const sceneDuration = Number(scene.duration_seconds || 0);
    if (
      Number.isFinite(sceneDuration) &&
      sceneDuration > 0 &&
      Math.abs(shotDurationTotal - sceneDuration) > 0.05
    ) {
      failures.push(failure(
        "SCENE_SHOT_DURATION_MISMATCH",
        `scenes.${sceneIndex}.shots`,
        "Shot durations must add up to the scene duration.",
        {
          scene_duration_seconds: sceneDuration,
          shot_duration_seconds: Number(shotDurationTotal.toFixed(6)),
        },
      ));
    }

    sceneSignatures.push({
      scene_index: sceneIndex,
      corpus: sceneExpectation(scene),
      beats: expectedBeats,
    });
  });

  for (let left = 0; left < sceneSignatures.length; left += 1) {
    for (let right = left + 1; right < sceneSignatures.length; right += 1) {
      const similarity = overlapRatio(
        sceneSignatures[left].corpus,
        sceneSignatures[right].corpus,
      );
      const beatOverlap = intersectionSize(
        sceneSignatures[left].beats,
        sceneSignatures[right].beats,
      );
      if (similarity >= 0.68 && beatOverlap > 0) {
        failures.push(failure(
          "SEMANTICALLY_REPEATED_SCENE_OBJECTIVE",
          "scenes",
          "Two scenes repeat substantially the same story objective.",
          {
            left_scene: left + 1,
            right_scene: right + 1,
            similarity: Number(similarity.toFixed(4)),
          },
        ));
      }
    }
  }

  for (let left = 0; left < shots.length; left += 1) {
    for (let right = left + 1; right < shots.length; right += 1) {
      const similarity = overlapRatio(
        shotFullCorpus(shots[left]),
        shotFullCorpus(shots[right]),
      );
      const leftBeat = primaryBeat(shotNarrative(shots[left]));
      const rightBeat = primaryBeat(shotNarrative(shots[right]));
      if (leftBeat && leftBeat === rightBeat && similarity >= 0.72) {
        failures.push(failure(
          "REPEATED_VISUAL_STORY_BEAT",
          "scenes.shots",
          "Two shots repeat the same visual story beat without enough new information.",
          {
            left_shot_id: shots[left].id || null,
            right_shot_id: shots[right].id || null,
            primary_beat: leftBeat,
            similarity: Number(similarity.toFixed(4)),
          },
        ));
      }
    }
  }

  const beatCounts = primaryBeats.reduce((counts, item) => {
    if (item.beat) counts[item.beat] = (counts[item.beat] || 0) + 1;
    return counts;
  }, {});
  const limitedBeatMaximums = {
    arrival: Math.max(2, Math.ceil(shots.length * 0.2)),
    discovery: Math.max(2, Math.ceil(shots.length * 0.2)),
    service: Math.max(2, Math.ceil(shots.length * 0.25)),
    closure: 2,
    brand_reveal: 2,
  };
  for (const [beat, maximum] of Object.entries(limitedBeatMaximums)) {
    if ((beatCounts[beat] || 0) > maximum) {
      failures.push(failure(
        "STORY_BEAT_OVERUSED",
        "scenes.shots",
        `The ${beat} beat is repeated too many times for the film length.`,
        {
          beat,
          count: beatCounts[beat],
          maximum,
        },
      ));
    }
  }

  let runBeat = null;
  let runLength = 0;
  for (const item of primaryBeats) {
    if (!item.beat) {
      runBeat = null;
      runLength = 0;
      continue;
    }
    if (item.beat === runBeat) {
      runLength += 1;
    } else {
      runBeat = item.beat;
      runLength = 1;
    }
    if (runLength > 2 && ["arrival", "discovery", "service", "consumption"].includes(runBeat)) {
      failures.push(failure(
        "CONSECUTIVE_STORY_BEAT_REPETITION",
        "scenes.shots",
        "The same transitional story beat repeats in more than two consecutive shots.",
        {
          beat: runBeat,
          run_length: runLength,
          scene_index: item.scene_index + 1,
          shot_index: item.shot_index + 1,
        },
      ));
      break;
    }
  }

  const finalScene = scenes[scenes.length - 1] || {};
  const finalNarrativeBeats = beatSet(
    list(finalScene.shots).flatMap(shotNarrative),
  );
  if (
    scenes.length &&
    !finalNarrativeBeats.has("closure") &&
    !finalNarrativeBeats.has("brand_reveal")
  ) {
    failures.push(failure(
      "FINAL_SCENE_CLOSURE_REQUIRED",
      `scenes.${Math.max(0, scenes.length - 1)}`,
      "The final scene must visibly resolve the story or deliver the earned invitation.",
      { final_beats: [...finalNarrativeBeats] },
    ));
  }

  if (scenes.length && brandEvidenceRequired(normalized) && !deterministicBrandClosure(finalScene)) {
    failures.push(failure(
      "DETERMINISTIC_FINAL_BRAND_COMPOSITION_REQUIRED",
      `scenes.${Math.max(0, scenes.length - 1)}.shots`,
      "A plan using an exact brand mark must define deterministic logo or title composition outside generated pixels.",
    ));
  }

  const uniqueFailures = [];
  const seen = new Set();
  for (const item of failures) {
    const identity = JSON.stringify([item.code, item.path, item.evidence]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    uniqueFailures.push(item);
  }

  return {
    passed: uniqueFailures.length === 0,
    workflow_kind: workflow || "TEMPORAL",
    failures: uniqueFailures,
    metrics: {
      scene_count: scenes.length,
      shot_count: shots.length,
      target_duration_seconds: durationTarget,
      scene_duration_total_seconds: Number(sceneDurationTotal.toFixed(6)),
      primary_beat_counts: beatCounts,
      final_scene_beats: [...finalNarrativeBeats],
      deterministic_brand_closure: deterministicBrandClosure(finalScene),
    },
  };
}

export function assertTemporalSemanticPlan(plan = {}) {
  const validation = validateTemporalSemanticPlan(plan);
  if (!validation.passed) {
    const codes = [...new Set(validation.failures.map((item) => item.code))];
    const error = new Error(
      `CREATIVE_TEMPORAL_SEMANTIC_PLAN_INVALID:${codes.join(",")}`,
    );
    error.validation = validation;
    throw error;
  }
  return validation;
}
