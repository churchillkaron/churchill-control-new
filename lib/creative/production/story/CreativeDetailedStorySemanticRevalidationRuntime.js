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

const RUNTIME_VERSION =
  "CREATIVE_DETAILED_STORY_SEMANTIC_REVALIDATION_V1";
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

function repairError(code, details = {}) {
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

function isNegativeOrConstraintSentence(value) {
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

function serializeAction(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(serializeAction).filter(Boolean).join(" ");
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
      .map(([, item]) => serializeAction(item))
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
    serializeAction(shot.foreground_action),
    serializeAction(shot.midground_action),
    serializeAction(shot.background_action),
    serializeAction(shot.action_beats),
    serializeAction(shot.actors),
    serializeAction(shot.subject_paths),
    serializeAction(shot.relationships),
  ];
  const providerSentences = sentenceList(shot.provider_brief)
    .filter((sentence) => !isNegativeOrConstraintSentence(sentence));

  return [
    ...directFields,
    ...providerSentences,
  ].filter(Boolean).join(" ").toLowerCase();
}

function motionFailures(positiveSource) {
  const failures = [];
  const cameraMotionPatterns = [
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
  const progressionPatterns = [
    /\bbegins? to\b/,
    /\bstarts? to\b/,
    /\bcontinues? to\b/,
    /\babout to\b/,
    /\bimminent(?:ly)?\b/,
    /\bwhile\b[^.!?;]{0,160}\b(?:begins?|starts?|moves?|drops?|slides?|falls?|clinks?|strikes?|travels?)\b/,
    /\bas\b[^.!?;]{0,160}\b(?:begins?|starts?|moves?|drops?|slides?|falls?|clinks?|strikes?|travels?)\b/,
    /\bsimultaneously\b/,
    /\bat the same time\b/,
    /\bstationary\s+mid[- ]?(?:slide|motion|movement)\b/,
    /\bfrozen\b[^.!?;]{0,100}\b(?:moving|traveling|gliding|sliding)\b/,
  ];

  if (cameraMotionPatterns.some((pattern) => pattern.test(positiveSource))) {
    failures.push("CAMERA_MOTION_LANGUAGE_IN_STILL");
  }
  if (progressionPatterns.some((pattern) => pattern.test(positiveSource))) {
    failures.push("MULTIPLE_TIME_STATES_IN_STILL");
  }

  return failures;
}

function stagedHumanFailures(positiveSource) {
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

  return patterns.some((pattern) => pattern.test(positiveSource))
    ? ["SYNTHETIC_OR_STAGED_HUMAN_BEHAVIOR_RISK"]
    : [];
}

function textSafetyFailures(shot = {}, positiveSource) {
  const failures = [];
  const visibleTextRequested = [
    /\blocation (?:caption|text)\b/,
    /\bcaption\b/,
    /\bslogan\b/,
    /\btagline\b/,
    /\btext overlay\b/,
    /\bgenerated typography\b/,
  ].some((pattern) => pattern.test(positiveSource));

  if (!visibleTextRequested) return failures;

  const policy = object(shot.provider_text_policy);
  const approvedIds = unique(
    list(policy.approved_text_source_asset_ids).map(String),
  );

  if (policy.generate_text !== false) {
    failures.push("PROVIDER_TEXT_GENERATION_MUST_BE_DISABLED");
  }
  if (policy.controlled_composite_required !== true) {
    failures.push("CONTROLLED_TEXT_COMPOSITE_REQUIRED");
  }
  if (!approvedIds.length) {
    failures.push("APPROVED_TEXT_SOURCE_ASSET_REQUIRED");
  }

  return failures;
}

function brandCompositeFailures(shot = {}) {
  const identitySource = [
    shot.title,
    shot.purpose,
    shot.story_purpose,
  ].filter(Boolean).join(" ").toLowerCase();

  if (!/\b(?:brand|logo|end card|closing card)\b/.test(identitySource)) {
    return [];
  }

  const policy = object(shot.provider_text_policy);
  const failures = [];

  if (policy.generate_text !== false) {
    failures.push("PROVIDER_TEXT_GENERATION_MUST_BE_DISABLED");
  }
  if (policy.controlled_composite_required !== true) {
    failures.push("CONTROLLED_BRAND_COMPOSITE_REQUIRED");
  }
  if (!list(policy.approved_text_source_asset_ids).length) {
    failures.push("APPROVED_BRAND_SOURCE_ASSET_REQUIRED");
  }

  return failures;
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
        `BRAND_TOKEN_NEAR_MISS:${canonical}:${unique(nearMisses).join(",")}`,
      );
    }
  }

  return failures;
}

function shotKey(sceneIndex, shotIndex) {
  return `${sceneIndex + 1}:${shotIndex + 1}`;
}

function hospitalityCoverage(story = {}) {
  const candidateScenes = list(story.scenes).filter((scene, index) => {
    const source = [
      scene.title,
      scene.objective,
    ].filter(Boolean).join(" ").toLowerCase();

    return index < 2 || /arrival|approach|entrance|welcome/.test(source);
  });
  const evidence = [];

  for (const scene of candidateScenes) {
    for (const shot of list(scene.shots)) {
      const actors = list(shot.actors);
      const staff = actors.find((actor) =>
        /staff|host|greeter|server|employee/.test(
          text(actor.narrative_role).toLowerCase(),
        ),
      );
      const guests = actors.filter((actor) =>
        /guest|customer|visitor|couple|friend/.test(
          text(actor.narrative_role).toLowerCase(),
        ),
      );

      if (!staff || !guests.length) continue;

      const staffSource = [
        staff.action,
        staff.body_orientation,
        staff.gaze_target,
        staff.interaction_target,
        staff.expression,
      ].filter(Boolean).join(" ").toLowerCase();
      const guestSource = guests.map((guest) => [
        guest.action,
        guest.start_position,
        guest.end_position,
        guest.travel_direction,
        guest.body_orientation,
        guest.gaze_target,
        guest.interaction_target,
      ].filter(Boolean).join(" ").toLowerCase()).join(" ");
      const staffWelcomes =
        /greet|welcome|receive|invite|open[- ]palm|gesture.*inside|guide.*inside/.test(staffSource);
      const guestsMoveInward =
        /entrance|inside|interior|door|doorway|venue/.test(guestSource) &&
        !/toward camera|outward|away from|leav/.test(guestSource);

      if (staffWelcomes && guestsMoveInward) {
        evidence.push({
          scene_number: scene.scene_number || null,
          shot_number: shot.shot_number || null,
          staff_role: staff.narrative_role || null,
          guest_roles: guests.map((guest) => guest.narrative_role),
        });
      }
    }
  }

  return {
    passed: evidence.length > 0,
    evidence,
  };
}

function validateShot({
  project,
  scene,
  shot,
  canonicalIds,
}) {
  const failures = [];
  const contract = compileCreativeShotBlockingContract({
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

  if (contract.completeness?.complete !== true) {
    failures.push({
      code: "BLOCKING_CONTRACT_INCOMPLETE",
      details: contract.completeness,
    });
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

  const semanticCodes = unique([
    ...motionFailures(positiveSource),
    ...stagedHumanFailures(positiveSource),
    ...textSafetyFailures(shot, positiveSource),
    ...brandCompositeFailures(shot),
    ...brandSpellingFailures(project, shot),
  ]);

  for (const code of semanticCodes) {
    failures.push({ code });
  }

  shot.blocking_contract = contract;

  return {
    failures,
    positive_source_character_count: positiveSource.length,
  };
}

export const CreativeDetailedStorySemanticRevalidationRuntime = {
  async run({
    organization_id,
    creative_project_id,
    repaired_result,
  } = {}) {
    if (!organization_id) {
      throw repairError("organization_id required");
    }
    if (!creative_project_id) {
      throw repairError("creative_project_id required");
    }

    const repaired = object(repaired_result);

    if (!repaired.preview_only || !repaired.repair_only) {
      throw repairError(
        "CREATIVE_SEMANTIC_REPAIRED_STORY_REQUIRED",
      );
    }
    if (
      String(repaired.organization_id || "") !==
      String(organization_id)
    ) {
      throw repairError(
        "CREATIVE_SEMANTIC_REVALIDATION_ORGANIZATION_MISMATCH",
      );
    }
    if (
      String(repaired.creative_project_id || "") !==
      String(creative_project_id)
    ) {
      throw repairError(
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
      throw repairError(
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
          project,
          scene,
          shot,
          canonicalIds,
        });
        const key = shotKey(sceneIndex, shotIndex);

        shotResults.push({
          key,
          scene_number: sceneIndex + 1,
          shot_number: shotIndex + 1,
          title: shot.title || null,
          passed: result.failures.length === 0,
          failures: result.failures,
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

    const hospitality = hospitalityCoverage(story);

    if (!hospitality.passed) {
      failures.push({
        code: "ARRIVAL_HOSPITALITY_BEAT_NOT_VISUALLY_PROVEN",
        requirement:
          "At least one early-story shot must show identifiable staff or host welcoming guests who are visibly directed into the venue.",
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
        scene_count: list(story.scenes).length,
        shot_count: shotCount,
        total_duration_seconds: roundedDuration,
        target_duration_seconds: targetDuration,
        passed_shot_count:
          shotResults.length - failedShotKeys.length,
        failed_shot_count: failedShotKeys.length,
        failed_shot_keys: failedShotKeys,
        hospitality,
        shots: shotResults,
        failures,
      },
      next_gate: passed
        ? "DETAILED_STORY_SEMANTIC_REVIEW_REQUIRED"
        : "DETAILED_STORY_TARGETED_REPAIR_REQUIRED",
    };
  },
};
