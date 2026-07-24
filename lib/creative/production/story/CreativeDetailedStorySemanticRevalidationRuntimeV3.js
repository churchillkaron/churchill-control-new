import {
  CreativeDetailedStorySemanticRevalidationRuntimeV2,
} from "@/lib/creative/production/story/CreativeDetailedStorySemanticRevalidationRuntimeV2";

const RUNTIME_VERSION =
  "CREATIVE_DETAILED_STORY_SEMANTIC_REVALIDATION_V3_CONTEXTUAL";

const RECLASSIFIED_CODES = new Set([
  "CAMERA_PROGRESSION_IN_STATIC_FRAME",
  "MULTIPLE_TIME_STATES_IN_STATIC_FRAME",
  "OVER_COORDINATED_PERFORMANCE_DIRECTION",
  "CONTROLLED_COMPOSITE_SOURCE_REQUIRED",
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

function sentenceList(value) {
  return text(value)
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isConstraintSentence(value) {
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
    /\bnot\s+(?:visible|shown|generated|included|required|present)\b/,
  ].some((pattern) => pattern.test(source));
}

function positiveFragments(value) {
  if (!value) return [];

  if (typeof value === "string") {
    return sentenceList(value).filter(
      (sentence) => !isConstraintSentence(sentence),
    );
  }

  if (Array.isArray(value)) {
    return value.flatMap(positiveFragments);
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => ![
        "forbidden_interpretations",
        "negative_constraints",
        "qa_checks",
        "semantic_repair_notes",
        "still_frame_rules",
        "provider_text_policy",
        "post_production_overlays",
        "quality_requirements",
      ].includes(key))
      .flatMap(([, item]) => positiveFragments(item));
  }

  return [String(value)];
}

function positiveShotText(shot = {}) {
  return [
    ...positiveFragments(shot.opening_frame),
    ...positiveFragments(shot.closing_frame),
    ...positiveFragments(shot.decisive_moment),
    ...positiveFragments(shot.screen_direction),
    ...positiveFragments(shot.environment_action),
    ...positiveFragments(shot.performance_direction),
    ...positiveFragments(shot.foreground_action),
    ...positiveFragments(shot.midground_action),
    ...positiveFragments(shot.background_action),
    ...positiveFragments(shot.action_beats),
    ...positiveFragments(shot.actors),
    ...positiveFragments(shot.subject_paths),
    ...positiveFragments(shot.relationships),
    ...positiveFragments(shot.provider_brief),
  ].join(" ").toLowerCase();
}

function detectCameraProgression(source) {
  return [
    /\bcamera\s+(?:moves?|tracks?|pans?|zooms?|doll(?:y|ies)|tilts?|orbits?|pushes?|pulls?)\b/,
    /\b(?:slow|gentle|subtle|steady|implied)?\s*dolly[- ]?(?:in|out)\b/,
    /\bfocus pull\b/,
    /\brack focus\b/,
    /\btracking shot\b/,
    /\bpush[- ]?in\b/,
    /\bpull[- ]?back\b/,
    /\bpan(?:ning)?\s+(?:left|right|across)\b/,
    /\btilt(?:ing)?\s+(?:left|right|up|down)\b/,
  ].some((pattern) => pattern.test(source));
}

function detectMultipleTimeStates(source) {
  return [
    /\bbegins? to\b/,
    /\bstarts? to\b/,
    /\bcontinues? to\b/,
    /\babout to\b/,
    /\bimminent(?:ly)?\b/,
    /\bstationary\s+mid[- ]?(?:slide|motion|movement)\b/,
    /\bfrozen\b[^.!?;]{0,100}\b(?:moving|traveling|gliding|sliding)\b/,
    /\bwhile\b[^.!?;]{0,160}\b(?:begins?|starts?|moves?|drops?|slides?|falls?|clinks?|strikes?|travels?)\b/,
    /\bfrom\b[^.!?;]{0,80}\bto\b[^.!?;]{0,80}\b(?:within|during|across)\s+(?:the\s+)?(?:frame|shot|image)\b/,
  ].some((pattern) => pattern.test(source));
}

function declaredParticipantCount(shot = {}, contract = {}) {
  const contractRoles = list(contract.roles);
  const rawActors = list(shot.actors);
  const roles = contractRoles.length ? contractRoles : rawActors;

  return roles.reduce((total, role) => {
    const count = Number(role.count || 1);
    return total + (Number.isFinite(count) && count > 0 ? count : 1);
  }, 0);
}

function detectOverCoordination({
  source,
  shot,
  contract,
}) {
  const participants = declaredParticipantCount(shot, contract);
  const multiSubjectLanguage =
    /\b(?:group|crowd|audience|friends|participants|people|players|guests|team|couple|pair|multiple)\b/.test(source);

  if (participants <= 1 && !multiSubjectLanguage) {
    return false;
  }

  return [
    /\bsynchronized\b/,
    /\bin unison\b/,
    /\bperfect(?:ly)? coordinated\b/,
    /\buniform smiles?\b/,
    /\bidentical expressions?\b/,
    /\ball\s+(?:people|participants|actors|subjects|friends|players|hands|faces|eyes|glasses)\b[^.!?;]{0,120}\b(?:smile|laugh|gaze|clap|toast|meet|raise|turn|look)\b/,
    /\bglasses meet simultaneously\b/,
    /\bcollective laughter peaks?\b/,
    /\beveryone\b[^.!?;]{0,100}\b(?:smiles?|laughs?|claps?|toasts?|looks?)\b/,
  ].some((pattern) => pattern.test(source));
}

function visualIdentityRequested(shot = {}, source = "") {
  const overlays = list(shot.post_production_overlays);
  const identitySource = [
    shot.title,
    shot.purpose,
    shot.story_purpose,
    shot.opening_frame,
    shot.closing_frame,
    shot.decisive_moment,
    source,
  ].filter(Boolean).join(" ").toLowerCase();

  return (
    overlays.length > 0 ||
    /\b(?:logo|wordmark|brand mark|end card|closing card|title card|on-screen text|caption|tagline|slogan|typography|legal copy|call to action|cta)\b/.test(identitySource)
  );
}

function controlledCompositeFailure({
  shot,
  source,
}) {
  const policy = object(shot.provider_text_policy);

  if (!visualIdentityRequested(shot, source)) {
    return false;
  }

  return (
    policy.controlled_composite_required === true &&
    list(policy.approved_text_source_asset_ids).length === 0
  );
}

function reclassifyShot({
  shot,
  previous,
}) {
  const contract = object(previous.narrative_intent_contract);
  const source = positiveShotText(shot);
  const retained = list(previous.failures).filter(
    (failure) => !RECLASSIFIED_CODES.has(failure.code),
  );

  if (detectCameraProgression(source)) {
    retained.push({
      code: "CAMERA_PROGRESSION_IN_STATIC_FRAME",
    });
  }

  if (detectMultipleTimeStates(source)) {
    retained.push({
      code: "MULTIPLE_TIME_STATES_IN_STATIC_FRAME",
    });
  }

  if (detectOverCoordination({
    source,
    shot,
    contract,
  })) {
    retained.push({
      code: "OVER_COORDINATED_PERFORMANCE_DIRECTION",
    });
  }

  if (controlledCompositeFailure({ shot, source })) {
    retained.push({
      code: "CONTROLLED_COMPOSITE_SOURCE_REQUIRED",
    });
  }

  const failures = retained.filter((failure, index, all) =>
    all.findIndex((candidate) =>
      JSON.stringify(candidate) === JSON.stringify(failure),
    ) === index,
  );

  return {
    ...previous,
    passed: failures.length === 0,
    failures,
    contextual_positive_source_character_count:
      source.length,
  };
}

function storyShotMap(story = {}) {
  const map = new Map();

  list(story.scenes).forEach((scene, sceneIndex) => {
    list(scene.shots).forEach((shot, shotIndex) => {
      map.set(`${sceneIndex + 1}:${shotIndex + 1}`, shot);
    });
  });

  return map;
}

export const CreativeDetailedStorySemanticRevalidationRuntimeV3 = {
  async run(args = {}) {
    const previous =
      await CreativeDetailedStorySemanticRevalidationRuntimeV2.run(args);
    const repaired = object(args.repaired_result);
    const shotMap = storyShotMap(repaired.story);
    const previousReview = object(previous.revalidation);
    const shots = list(previousReview.shots).map((shotReview) => {
      const shot = shotMap.get(shotReview.key) || {};
      return reclassifyShot({
        shot,
        previous: shotReview,
      });
    });
    const failedShots = shots.filter((shot) => !shot.passed);
    const shotFailures = failedShots.map((shot) => ({
      scene_number: shot.scene_number,
      shot_number: shot.shot_number,
      title: shot.title,
      failures: shot.failures,
    }));
    const structuralFailures = list(previousReview.failures).filter(
      (failure) =>
        !failure.scene_number &&
        failure.code !== "STORY_INTENT_COVERAGE_INCOMPLETE",
    );
    const intentCoverageFailures = shots.flatMap((shot) =>
      list(shot.failures)
        .filter((failure) => [
          "NARRATIVE_PURPOSE_REQUIRED",
          "DECISIVE_MOMENT_REQUIRED",
          "NARRATIVE_STATE_BEFORE_REQUIRED",
          "NARRATIVE_STATE_AFTER_REQUIRED",
          "EXACT_EVIDENCE_REFERENCE_REQUIRED",
          "CREATIVE_INTERPRETATION_MISSING_EVIDENCE_REQUIRED",
          "TEXT_POLICY_CONTRADICTORY",
          "CONTROLLED_COMPOSITE_SOURCE_REQUIRED",
        ].includes(failure.code) ||
          text(failure.code).startsWith("ROLE_CONTRACT_INCOMPLETE:"))
        .map((failure) => `${shot.key}:${failure.code}`),
    );
    const failures = [
      ...shotFailures,
      ...structuralFailures,
    ];

    if (intentCoverageFailures.length) {
      failures.push({
        code: "STORY_INTENT_COVERAGE_INCOMPLETE",
        failures: unique(intentCoverageFailures),
      });
    }

    const passed = failures.length === 0;

    return {
      ...previous,
      success: passed,
      dynamic_contract: true,
      contextual_validation: true,
      revalidation_version: RUNTIME_VERSION,
      revalidation: {
        ...previousReview,
        passed,
        dynamic_contract: true,
        contextual_validation: true,
        passed_shot_count:
          shots.length - failedShots.length,
        failed_shot_count: failedShots.length,
        failed_shot_keys: failedShots.map((shot) => shot.key),
        intent_coverage: {
          version: "CREATIVE_STORY_INTENT_COVERAGE_V2_CONTEXTUAL",
          scene_count:
            previousReview.intent_coverage?.scene_count || 0,
          shot_count: shots.length,
          passed: intentCoverageFailures.length === 0,
          failures: unique(intentCoverageFailures),
          contracts: shots.map((shot) => ({
            key: shot.key,
            scene_number: shot.scene_number,
            shot_number: shot.shot_number,
            title: shot.title,
            contract: shot.narrative_intent_contract,
          })),
        },
        shots,
        failures,
      },
      next_gate: passed
        ? "DETAILED_STORY_SEMANTIC_REVIEW_REQUIRED"
        : "DETAILED_STORY_TARGETED_REPAIR_REQUIRED",
    };
  },
};
