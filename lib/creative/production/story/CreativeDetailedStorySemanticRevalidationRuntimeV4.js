import {
  CreativeDetailedStorySemanticRevalidationRuntimeV3,
} from "@/lib/creative/production/story/CreativeDetailedStorySemanticRevalidationRuntimeV3";

const RUNTIME_VERSION =
  "CREATIVE_DETAILED_STORY_SEMANTIC_REVALIDATION_V4_EVIDENCE";

const RECLASSIFIED_CODES = new Set([
  "CAMERA_PROGRESSION_IN_STATIC_FRAME",
  "MULTIPLE_TIME_STATES_IN_STATIC_FRAME",
  "OVER_COORDINATED_PERFORMANCE_DIRECTION",
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
    /\bnot\s+(?:visible|shown|generated|included|required|present)\b/,
  ].some((pattern) => pattern.test(source));
}

function positiveSentences(value) {
  if (!value) return [];

  if (typeof value === "string") {
    return sentenceList(value).filter(
      (sentence) => !isConstraintSentence(sentence),
    );
  }

  if (Array.isArray(value)) {
    return value.flatMap(positiveSentences);
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
      .flatMap(([, item]) => positiveSentences(item));
  }

  return [String(value)];
}

function collectEvidenceSentences(shot = {}) {
  return unique([
    ...positiveSentences(shot.opening_frame),
    ...positiveSentences(shot.closing_frame),
    ...positiveSentences(shot.decisive_moment),
    ...positiveSentences(shot.screen_direction),
    ...positiveSentences(shot.environment_action),
    ...positiveSentences(shot.performance_direction),
    ...positiveSentences(shot.foreground_action),
    ...positiveSentences(shot.midground_action),
    ...positiveSentences(shot.background_action),
    ...positiveSentences(shot.action_beats),
    ...positiveSentences(shot.actors),
    ...positiveSentences(shot.subject_paths),
    ...positiveSentences(shot.relationships),
    ...positiveSentences(shot.provider_brief),
  ]);
}

function evidenceMatches(sentences, patterns) {
  const matches = [];

  for (const sentence of sentences) {
    const normalized = sentence.toLowerCase();
    if (patterns.some((pattern) => pattern.test(normalized))) {
      matches.push(sentence);
    }
  }

  return unique(matches);
}

function cameraEvidence(sentences) {
  return evidenceMatches(sentences, [
    /\bcamera\s+(?:moves?|tracks?|pans?|zooms?|doll(?:y|ies)|tilts?|orbits?|pushes?|pulls?)\b/,
    /\b(?:slow|gentle|subtle|steady|implied)?\s*dolly[- ]?(?:in|out)\b/,
    /\bfocus pull\b/,
    /\brack focus\b/,
    /\btracking shot\b/,
    /\bpush[- ]?in\b/,
    /\bpull[- ]?back\b/,
    /\bpan(?:ning)?\s+(?:left|right|across)\b/,
    /\btilt(?:ing)?\s+(?:left|right|up|down)\b/,
  ]);
}

function temporalEvidence(sentences) {
  return evidenceMatches(sentences, [
    /\bbegins? to\b/,
    /\bstarts? to\b/,
    /\bcontinues? to\b/,
    /\babout to\b/,
    /\bimminent(?:ly)?\b/,
    /\bstationary\s+mid[- ]?(?:slide|motion|movement)\b/,
    /\bfrozen\b[^.!?;]{0,100}\b(?:moving|traveling|gliding|sliding)\b/,
    /\bwhile\b[^.!?;]{0,160}\b(?:begins?|starts?|moves?|drops?|slides?|falls?|clinks?|strikes?|travels?)\b/,
    /\bfrom\b[^.!?;]{0,80}\bto\b[^.!?;]{0,80}\b(?:within|during|across)\s+(?:the\s+)?(?:frame|shot|image)\b/,
  ]);
}

function visibleActorCount(shot = {}, contract = {}) {
  const roles = list(contract.roles).length
    ? list(contract.roles)
    : list(shot.actors);

  return roles.reduce((total, role) => {
    if (role.must_be_visually_identifiable === false) return total;
    const count = Number(role.count || 1);
    return total + (Number.isFinite(count) && count > 0 ? count : 1);
  }, 0);
}

function coordinationEvidence({
  sentences,
  shot,
  contract,
}) {
  if (visibleActorCount(shot, contract) <= 1) {
    return [];
  }

  return evidenceMatches(sentences, [
    /\bsynchronized\b/,
    /\bin unison\b/,
    /\bperfect(?:ly)? coordinated\b/,
    /\buniform smiles?\b/,
    /\bidentical expressions?\b/,
    /\ball\s+(?:people|participants|actors|subjects|friends|players|hands|faces|eyes|glasses)\b[^.!?;]{0,120}\b(?:smile|laugh|gaze|clap|toast|meet|raise|turn|look)\b/,
    /\beveryone\b[^.!?;]{0,100}\b(?:smiles?|laughs?|claps?|toasts?|looks?|raises?)\b/,
    /\bglasses meet simultaneously\b/,
    /\bcollective laughter peaks?\b/,
  ]);
}

function dedupeFailures(failures = []) {
  return failures.filter((failure, index, all) =>
    all.findIndex((candidate) =>
      JSON.stringify(candidate) === JSON.stringify(failure),
    ) === index,
  );
}

function reclassifyShot({
  shot,
  previous,
}) {
  const contract = object(previous.narrative_intent_contract);
  const sentences = collectEvidenceSentences(shot);
  const retained = list(previous.failures).filter(
    (failure) => !RECLASSIFIED_CODES.has(failure.code),
  );
  const evidence = {
    camera_progression: cameraEvidence(sentences),
    multiple_time_states: temporalEvidence(sentences),
    over_coordinated_performance: coordinationEvidence({
      sentences,
      shot,
      contract,
    }),
  };

  if (evidence.camera_progression.length) {
    retained.push({
      code: "CAMERA_PROGRESSION_IN_STATIC_FRAME",
      evidence: evidence.camera_progression,
    });
  }

  if (evidence.multiple_time_states.length) {
    retained.push({
      code: "MULTIPLE_TIME_STATES_IN_STATIC_FRAME",
      evidence: evidence.multiple_time_states,
    });
  }

  if (evidence.over_coordinated_performance.length) {
    retained.push({
      code: "OVER_COORDINATED_PERFORMANCE_DIRECTION",
      evidence: evidence.over_coordinated_performance,
    });
  }

  const failures = dedupeFailures(retained);

  return {
    ...previous,
    passed: failures.length === 0,
    failures,
    validation_evidence: evidence,
    evaluated_positive_sentences: sentences.length,
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

export const CreativeDetailedStorySemanticRevalidationRuntimeV4 = {
  async run(args = {}) {
    const previous =
      await CreativeDetailedStorySemanticRevalidationRuntimeV3.run(args);
    const repaired = object(args.repaired_result);
    const shotMap = storyShotMap(repaired.story);
    const previousReview = object(previous.revalidation);
    const shots = list(previousReview.shots).map((shotReview) =>
      reclassifyShot({
        shot: shotMap.get(shotReview.key) || {},
        previous: shotReview,
      }),
    );
    const failedShots = shots.filter((shot) => !shot.passed);
    const shotFailures = failedShots.map((shot) => ({
      scene_number: shot.scene_number,
      shot_number: shot.shot_number,
      title: shot.title,
      failures: shot.failures,
    }));
    const structuralFailures = list(previousReview.failures).filter(
      (failure) => !failure.scene_number,
    );
    const failures = [
      ...shotFailures,
      ...structuralFailures,
    ];
    const passed = failures.length === 0;

    return {
      ...previous,
      success: passed,
      dynamic_contract: true,
      contextual_validation: true,
      evidence_validation: true,
      revalidation_version: RUNTIME_VERSION,
      revalidation: {
        ...previousReview,
        passed,
        dynamic_contract: true,
        contextual_validation: true,
        evidence_validation: true,
        passed_shot_count:
          shots.length - failedShots.length,
        failed_shot_count: failedShots.length,
        failed_shot_keys: failedShots.map((shot) => shot.key),
        shots,
        failures,
      },
      next_gate: passed
        ? "DETAILED_STORY_SEMANTIC_REVIEW_REQUIRED"
        : "DETAILED_STORY_TARGETED_REPAIR_REQUIRED",
    };
  },
};
