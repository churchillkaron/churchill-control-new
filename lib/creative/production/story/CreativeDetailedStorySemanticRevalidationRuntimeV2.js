import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  compileCreativeShotBlockingContract,
} from "@/lib/creative/production/contracts/CreativeShotBlockingContract";

import {
  compileCreativeNarrativeIntentContract,
  compileCreativeStoryIntentCoverage,
} from "@/lib/creative/production/contracts/CreativeNarrativeIntentContract";

const RUNTIME_VERSION =
  "CREATIVE_DETAILED_STORY_SEMANTIC_REVALIDATION_V2_DYNAMIC";
const MIN_PROVIDER_BRIEF_CHARACTERS = 1400;
const MIN_FORBIDDEN_INTERPRETATIONS = 8;
const MIN_BINARY_QA_CHECKS = 12;
const DURATION_TOLERANCE_SECONDS = 0.1;

const GROUNDING_LEVELS = new Set([
  "EXACT_REFERENCE_GROUNDED",
  "PARTIALLY_REFERENCE_GROUNDED",
  "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL",
]);

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function runtimeError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function assetId(value = {}) {
  return String(value.id || value.asset_id || "");
}

function assetUrl(value = {}) {
  return (
    value.image_url ||
    value.file_url ||
    value.url ||
    value.thumbnail_url ||
    null
  );
}

function visualAsset(value = {}) {
  if (!assetId(value) || value.archived || !assetUrl(value)) {
    return false;
  }

  const source = [
    value.asset_type,
    value.mime_type,
    value.metadata?.mime_type,
    value.file_name,
    assetUrl(value),
  ].filter(Boolean).join(" ").toLowerCase();

  return !(
    /audio\//.test(source) ||
    /video\//.test(source) ||
    /\.(mp3|wav|aac|m4a|flac|mp4|mov|webm|m4v)(?:\?|$)/.test(source)
  );
}

function mergeAssets(...groups) {
  const byId = new Map();

  for (const group of groups) {
    for (const asset of group || []) {
      if (!visualAsset(asset)) continue;
      const id = assetId(asset);
      if (!byId.has(id)) byId.set(id, asset);
    }
  }

  return [...byId.values()].slice(0, 200);
}

function projectMissionId(project = {}) {
  return (
    project.creative_mission_id ||
    project.mission_id ||
    project.campaign_id ||
    project.metadata?.creative_mission_id ||
    project.metadata?.mission_id ||
    null
  );
}

async function resolveAssets({
  organization_id,
  creative_project_id,
  creative_mission_id,
}) {
  const [projectAssets, missionAssets, organizationAssets] =
    await Promise.all([
      CreativeAssetsRuntime.list({
        organization_id,
        creative_project_id,
        limit: 200,
      }),
      creative_mission_id
        ? CreativeAssetsRuntime.list({
            organization_id,
            creative_mission_id,
            limit: 200,
          })
        : Promise.resolve([]),
      CreativeAssetsRuntime.list({
        organization_id,
        limit: 200,
      }),
    ]);

  return mergeAssets(
    projectAssets,
    missionAssets,
    organizationAssets,
  );
}

function sentenceList(value) {
  return text(value)
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isNegativeSentence(value) {
  const source = text(value).toLowerCase();

  return [
    /\bno\b/,
    /\bwithout\b/,
    /\bavoid\b/,
    /\bforbid(?:den)?\b/,
    /\bmust not\b/,
    /\bdo not\b/,
    /\bnever\b/,
    /\bexclude(?:d)?\b/,
    /\bprevent(?:ing|ed)?\b/,
    /\beliminat(?:e|ed|ing)\b/,
    /\bprohibit(?:ed|ing)?\b/,
    /\brather than\b/,
    /\binstead of\b/,
    /\bignore\b/,
    /\breserved for post-production\b/,
  ].some((pattern) => pattern.test(source));
}

function serializePositive(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(serializePositive).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => ![
        "forbidden_interpretations",
        "negative_constraints",
        "qa_checks",
        "semantic_repair_notes",
        "still_frame_rules",
      ].includes(key))
      .map(([, item]) => serializePositive(item))
      .filter(Boolean)
      .join(" ");
  }
  return String(value);
}

function positiveShotText(shot = {}) {
  const directFields = [
    shot.opening_frame,
    shot.closing_frame,
    shot.decisive_moment,
    shot.screen_direction,
    shot.environment_action,
    shot.performance_direction,
    serializePositive(shot.foreground_action),
    serializePositive(shot.midground_action),
    serializePositive(shot.background_action),
    serializePositive(shot.action_beats),
    serializePositive(shot.actors),
    serializePositive(shot.subject_paths),
    serializePositive(shot.relationships),
  ];
  const providerSentences = sentenceList(shot.provider_brief)
    .filter((sentence) => !isNegativeSentence(sentence));

  return [
    ...directFields,
    ...providerSentences,
  ].filter(Boolean).join(" ").toLowerCase();
}

function detectStaticFrameFailures(source) {
  const failures = [];
  const cameraProgression = [
    /\bcamera\s+(?:moves?|tracks?|pans?|zooms?|doll(?:y|ies)|tilts?|orbits?|pushes?|pulls?)\b/,
    /\b(?:slow|gentle|subtle|steady)?\s*dolly[- ]?(?:in|out)\b/,
    /\bfocus pull\b/,
    /\brack focus\b/,
    /\btracking shot\b/,
    /\bpush[- ]?in\b/,
    /\bpull[- ]?back\b/,
    /\bpan(?:ning)?\s+(?:left|right|across)\b/,
    /\btilt(?:ing)?\s+(?:left|right|up|down)\b/,
  ];
  const temporalProgression = [
    /\bbegins? to\b/,
    /\bstarts? to\b/,
    /\bcontinues? to\b/,
    /\babout to\b/,
    /\bimminent(?:ly)?\b/,
    /\bsimultaneously\b/,
    /\bat the same time\b/,
    /\bstationary\s+mid[- ]?(?:slide|motion|movement)\b/,
    /\bfrozen\b[^.!?;]{0,100}\b(?:moving|traveling|gliding|sliding)\b/,
    /\bwhile\b[^.!?;]{0,160}\b(?:begins?|starts?|moves?|drops?|slides?|falls?|clinks?|strikes?|travels?)\b/,
  ];

  if (cameraProgression.some((pattern) => pattern.test(source))) {
    failures.push("CAMERA_PROGRESSION_IN_STATIC_FRAME");
  }
  if (temporalProgression.some((pattern) => pattern.test(source))) {
    failures.push("MULTIPLE_TIME_STATES_IN_STATIC_FRAME");
  }

  return failures;
}

function detectPerformanceFailures(source) {
  const patterns = [
    /\bsynchronized\b/,
    /\bperfect(?:ly)? coordinated\b/,
    /\buniform smiles?\b/,
    /\bidentical expressions?\b/,
    /\ball\b[^.!?;]{0,120}\b(?:smile|laugh|gaze|eyes|clap|toast|glasses meet)\b/,
    /\bcollective laughter peaks?\b/,
    /\bglasses meet simultaneously\b/,
    /\bfaces? (?:toward|facing) the camera\b/,
  ];

  return patterns.some((pattern) => pattern.test(source))
    ? ["OVER_COORDINATED_PERFORMANCE_DIRECTION"]
    : [];
}

function levenshtein(a, b) {
  const left = String(a || "").toLowerCase();
  const right = String(b || "").toLowerCase();
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }

  return row[right.length];
}

function brandSpellingFailures(project = {}, shot = {}) {
  const canonicalTokens = text(project.name)
    .match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g) || [];
  const protectedTokens = canonicalTokens
    .filter((token) => token.length >= 6);
  const sourceTokens = [
    shot.title,
    shot.purpose,
    shot.story_purpose,
    shot.opening_frame,
    shot.closing_frame,
    shot.decisive_moment,
    shot.provider_brief,
  ].filter(Boolean).join(" ")
    .match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g) || [];
  const failures = [];

  for (const canonical of protectedTokens) {
    const lowerCanonical = canonical.toLowerCase();
    const nearMisses = sourceTokens.filter((candidate) => {
      const lowerCandidate = candidate.toLowerCase();
      return (
        lowerCandidate !== lowerCanonical &&
        Math.abs(lowerCandidate.length - lowerCanonical.length) <= 1 &&
        levenshtein(lowerCandidate, lowerCanonical) === 1
      );
    });

    if (nearMisses.length) {
      failures.push(
        `CANONICAL_NAME_NEAR_MISS:${canonical}:${unique(nearMisses).join(",")}`,
      );
    }
  }

  return failures;
}

function validateShot({
  story,
  project,
  scene,
  shot,
  canonicalIds,
}) {
  const failures = [];
  const blocking = compileCreativeShotBlockingContract({
    scene,
    shot,
  });
  const intent = compileCreativeNarrativeIntentContract({
    story,
    scene,
    shot,
  });
  const references = unique(
    list(shot.reference_asset_ids).map(String),
  );
  const unknownReferences = references.filter(
    (id) => !canonicalIds.has(id),
  );
  const grounding = text(
    shot.reference_grounding ||
    scene.reference_grounding,
  ).toUpperCase();
  const positiveSource = positiveShotText(shot);

  if (blocking.completeness?.complete !== true) {
    failures.push({
      code: "BLOCKING_CONTRACT_INCOMPLETE",
      details: blocking.completeness,
    });
  }

  if (intent.completeness?.complete !== true) {
    for (const code of intent.completeness.failures) {
      failures.push({ code });
    }
  }

  if (text(shot.provider_brief).length < MIN_PROVIDER_BRIEF_CHARACTERS) {
    failures.push({
      code: "PROVIDER_BRIEF_TOO_SHORT",
      actual_characters: text(shot.provider_brief).length,
      minimum_characters: MIN_PROVIDER_BRIEF_CHARACTERS,
    });
  }

  if (list(shot.forbidden_interpretations).length < MIN_FORBIDDEN_INTERPRETATIONS) {
    failures.push({
      code: "FORBIDDEN_INTERPRETATIONS_INSUFFICIENT",
      actual: list(shot.forbidden_interpretations).length,
      minimum: MIN_FORBIDDEN_INTERPRETATIONS,
    });
  }

  if (list(shot.qa_checks).length < MIN_BINARY_QA_CHECKS) {
    failures.push({
      code: "QA_CHECKS_INSUFFICIENT",
      actual: list(shot.qa_checks).length,
      minimum: MIN_BINARY_QA_CHECKS,
    });
  }

  if (!GROUNDING_LEVELS.has(grounding)) {
    failures.push({
      code: "REFERENCE_GROUNDING_INVALID",
      value: grounding || null,
    });
  }

  if (
    grounding === "EXACT_REFERENCE_GROUNDED" &&
    !references.length
  ) {
    failures.push({
      code: "EXACT_GROUNDING_REFERENCE_REQUIRED",
    });
  }

  if (
    grounding === "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL" &&
    !list(shot.missing_evidence).length
  ) {
    failures.push({
      code: "CREATIVE_INTERPRETATION_MISSING_EVIDENCE_REQUIRED",
    });
  }

  if (unknownReferences.length) {
    failures.push({
      code: "UNKNOWN_REFERENCE_ASSET_IDS",
      asset_ids: unknownReferences,
    });
  }

  for (const code of unique([
    ...detectStaticFrameFailures(positiveSource),
    ...detectPerformanceFailures(positiveSource),
    ...brandSpellingFailures(project, shot),
  ])) {
    failures.push({ code });
  }

  shot.blocking_contract = blocking;
  shot.narrative_intent_contract = intent;

  return {
    failures,
    blocking,
    intent,
    positive_source_character_count: positiveSource.length,
  };
}

export const CreativeDetailedStorySemanticRevalidationRuntimeV2 = {
  async run({
    organization_id,
    creative_project_id,
    repaired_result,
  } = {}) {
    if (!organization_id) {
      throw runtimeError("organization_id required");
    }
    if (!creative_project_id) {
      throw runtimeError("creative_project_id required");
    }

    const repaired = object(repaired_result);

    if (!repaired.preview_only || !repaired.repair_only) {
      throw runtimeError(
        "CREATIVE_SEMANTIC_REPAIRED_STORY_REQUIRED",
      );
    }
    if (
      String(repaired.organization_id || "") !==
      String(organization_id)
    ) {
      throw runtimeError(
        "CREATIVE_SEMANTIC_REVALIDATION_ORGANIZATION_MISMATCH",
      );
    }
    if (
      String(repaired.creative_project_id || "") !==
      String(creative_project_id)
    ) {
      throw runtimeError(
        "CREATIVE_SEMANTIC_REVALIDATION_PROJECT_MISMATCH",
      );
    }

    const project = await CreativeProjectRuntime.get(
      creative_project_id,
    );

    if (
      !project ||
      String(project.organization_id) !== String(organization_id)
    ) {
      throw runtimeError(
        "CREATIVE_PROJECT_NOT_IN_ORGANIZATION",
      );
    }

    const missionId = projectMissionId(project);
    const mission = missionId
      ? await CreativeMissionRuntime.get(missionId)
      : null;
    const assets = await resolveAssets({
      organization_id,
      creative_project_id,
      creative_mission_id:
        mission?.id || missionId || null,
    });
    const canonicalIds = new Set(
      assets.map(assetId).filter(Boolean),
    );
    const story = object(repaired.story);
    const intentCoverage = compileCreativeStoryIntentCoverage(story);
    const failures = [];
    const shotResults = [];
    let shotCount = 0;
    let duration = 0;

    list(story.scenes).forEach((scene, sceneIndex) => {
      if (Number(scene.scene_number) !== sceneIndex + 1) {
        failures.push({
          scene_number: scene.scene_number || null,
          code: "SCENE_NUMBER_NOT_SEQUENTIAL",
          expected: sceneIndex + 1,
        });
      }

      list(scene.shots).forEach((shot, shotIndex) => {
        shotCount += 1;
        duration += Number(shot.duration_seconds || 0);
        const result = validateShot({
          story,
          project,
          scene,
          shot,
          canonicalIds,
        });
        const key = `${sceneIndex + 1}:${shotIndex + 1}`;

        shotResults.push({
          key,
          scene_number: sceneIndex + 1,
          shot_number: shotIndex + 1,
          title: shot.title || null,
          passed: result.failures.length === 0,
          failures: result.failures,
          narrative_intent_contract: result.intent,
          positive_source_character_count:
            result.positive_source_character_count,
        });

        if (result.failures.length) {
          failures.push({
            scene_number: sceneIndex + 1,
            shot_number: shotIndex + 1,
            title: shot.title || null,
            failures: result.failures,
          });
        }
      });
    });

    if (!intentCoverage.passed) {
      failures.push({
        code: "STORY_INTENT_COVERAGE_INCOMPLETE",
        failures: intentCoverage.failures,
      });
    }

    const expectedSceneCount = Number(
      repaired.source_scene_count ||
      repaired.validation?.scene_count ||
      0,
    );
    const expectedShotCount = Number(
      repaired.source_shot_count ||
      repaired.validation?.shot_count ||
      0,
    );

    if (
      expectedSceneCount &&
      list(story.scenes).length !== expectedSceneCount
    ) {
      failures.push({
        code: "SOURCE_SCENE_COUNT_CHANGED",
        expected: expectedSceneCount,
        actual: list(story.scenes).length,
      });
    }

    if (expectedShotCount && shotCount !== expectedShotCount) {
      failures.push({
        code: "SOURCE_SHOT_COUNT_CHANGED",
        expected: expectedShotCount,
        actual: shotCount,
      });
    }

    const roundedDuration = Math.round(duration * 1000) / 1000;
    const targetDuration = Number(
      repaired.validation?.target_duration_seconds ||
      project.target_duration ||
      project.metadata?.specifications?.duration ||
      0,
    ) || null;

    if (
      targetDuration &&
      Math.abs(roundedDuration - targetDuration) >
        DURATION_TOLERANCE_SECONDS
    ) {
      failures.push({
        code: "STORY_DURATION_DOES_NOT_MATCH_TARGET",
        target_duration_seconds: targetDuration,
        actual_duration_seconds: roundedDuration,
        tolerance_seconds: DURATION_TOLERANCE_SECONDS,
      });
    }

    const failedShotKeys = shotResults
      .filter((item) => !item.passed)
      .map((item) => item.key);
    const passed = failures.length === 0;

    return {
      success: passed,
      review_only: true,
      preview_only: true,
      dynamic_contract: true,
      revalidation_version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      creative_mission_id:
        mission?.id || missionId || null,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      assets_created: 0,
      revalidation: {
        passed,
        dynamic_contract: true,
        scene_count: list(story.scenes).length,
        shot_count: shotCount,
        total_duration_seconds: roundedDuration,
        target_duration_seconds: targetDuration,
        passed_shot_count:
          shotResults.length - failedShotKeys.length,
        failed_shot_count: failedShotKeys.length,
        failed_shot_keys: failedShotKeys,
        intent_coverage: intentCoverage,
        shots: shotResults,
        failures,
      },
      next_gate: passed
        ? "DETAILED_STORY_SEMANTIC_REVIEW_REQUIRED"
        : "DETAILED_STORY_TARGETED_REPAIR_REQUIRED",
    };
  },
};
