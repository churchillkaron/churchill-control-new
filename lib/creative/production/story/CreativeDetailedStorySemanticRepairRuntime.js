import { createHash } from "node:crypto";

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
  reason,
} from "@/lib/creative/reasoning/CreativeReasoningService";

import {
  compileCreativeShotBlockingContract,
} from "@/lib/creative/production/contracts/CreativeShotBlockingContract";

const RUNTIME_VERSION =
  "CREATIVE_DETAILED_STORY_SEMANTIC_REPAIR_V1";
const CONCURRENCY = 2;
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

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(value || {}))
    .digest("hex");
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

function compactAsset(value = {}) {
  return {
    id: value.id || value.asset_id || null,
    name:
      value.name ||
      value.title ||
      value.file_name ||
      null,
    asset_type: value.asset_type || value.type || null,
    roles: [
      ...list(value.reference_roles),
      ...list(value.reference_role),
      ...list(value.roles),
      ...list(value.role),
      ...list(value.metadata?.reference_roles),
      ...list(value.metadata?.reference_role),
      ...list(value.analysis?.reference_roles),
    ],
    tags: list(value.tags).slice(0, 30),
    description:
      value.description ||
      value.caption ||
      value.analysis?.summary ||
      null,
    approved_reference:
      value.approved_reference === true ||
      String(value.status || "").toUpperCase() === "APPROVED" ||
      null,
  };
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

function storyCounts(story = {}) {
  const scenes = list(story.scenes);

  return {
    scene_count: scenes.length,
    shot_count: scenes.reduce(
      (total, scene) => total + list(scene.shots).length,
      0,
    ),
  };
}

function validateInputs({
  organization_id,
  creative_project_id,
  completed_result,
  semantic_review_result,
}) {
  const completed = object(completed_result);
  const reviewed = object(semantic_review_result);
  const completedHash = hash(completed);
  const counts = storyCounts(completed.story);

  if (!completed.preview_only) {
    throw repairError(
      "CREATIVE_COMPLETED_STORY_PREVIEW_REQUIRED",
    );
  }
  if (!reviewed.review_only) {
    throw repairError(
      "CREATIVE_SEMANTIC_REVIEW_RESULT_REQUIRED",
    );
  }

  for (const candidate of [completed, reviewed]) {
    if (
      String(candidate.organization_id || "") !==
      String(organization_id || "")
    ) {
      throw repairError(
        "CREATIVE_SEMANTIC_REPAIR_ORGANIZATION_MISMATCH",
      );
    }
    if (
      String(candidate.creative_project_id || "") !==
      String(creative_project_id || "")
    ) {
      throw repairError(
        "CREATIVE_SEMANTIC_REPAIR_PROJECT_MISMATCH",
      );
    }
  }

  if (
    reviewed.completed_story_hash &&
    String(reviewed.completed_story_hash) !== completedHash
  ) {
    throw repairError(
      "CREATIVE_SEMANTIC_REVIEW_STORY_HASH_MISMATCH",
      {
        expected: completedHash,
        actual: reviewed.completed_story_hash,
      },
    );
  }

  if (!counts.scene_count || !counts.shot_count) {
    throw repairError(
      "CREATIVE_COMPLETED_STORY_STRUCTURE_REQUIRED",
    );
  }

  const shotReviews = list(
    reviewed.semantic_review?.shots,
  );

  if (shotReviews.length !== counts.shot_count) {
    throw repairError(
      "CREATIVE_SEMANTIC_REVIEW_SHOT_COUNT_MISMATCH",
      {
        expected: counts.shot_count,
        actual: shotReviews.length,
      },
    );
  }

  return {
    completed,
    reviewed,
    completed_hash: completedHash,
    shot_reviews: shotReviews,
    global_review:
      object(reviewed.semantic_review?.global),
    ...counts,
  };
}

function shotKey(sceneIndex, shotIndex) {
  return `${sceneIndex + 1}:${shotIndex + 1}`;
}

function reviewKey(review = {}) {
  return `${Number(review.scene_number)}:${Number(review.shot_number)}`;
}

function semanticDeterministicFailures({
  scene,
  shot,
}) {
  const source = [
    shot.title,
    shot.story_purpose,
    shot.opening_frame,
    shot.closing_frame,
    shot.decisive_moment,
    shot.screen_direction,
    shot.environment_action,
    shot.performance_direction,
    shot.provider_brief,
    ...list(shot.qa_checks),
    ...list(shot.forbidden_interpretations),
  ].filter(Boolean).join(" ").toLowerCase();
  const failures = [];

  const motionPatterns = [
    /focus pull/,
    /camera moves/,
    /camera tracks/,
    /slow pan/,
    /zoom[- ]?in/,
    /dolly[- ]?in/,
    /begins to drop/,
    /rolling toward/,
    /glides? (?:in|across|toward)/,
    /wafting (?:up|upward|upwards)/,
    /about to clink/,
    /clapping in unison/,
    /mid[- ]?downstroke/,
    /mid[- ]?gesture/,
    /mid[- ]?handshake/,
    /while .* begins/,
    /simultaneously/,
  ];
  const stagedHumanPatterns = [
    /synchronized laughter/,
    /synchronized smiles/,
    /all .* eyes meet/,
    /all .* gaze/,
    /all four .* meet/,
    /glasses meet simultaneously/,
    /perfect(?:ly)? coordinated/,
    /faces? .* camera/,
  ];
  const generatedTextPatterns = [
    /location caption/,
    /location text/,
    /generated typography/,
    /text overlay/,
    /fully legible text/,
    /slogan/,
    /tagline/,
  ];

  if (motionPatterns.some((pattern) => pattern.test(source))) {
    failures.push(
      "MULTIPLE_TIME_STATES_OR_MOTION_LANGUAGE_IN_STILL",
    );
  }
  if (stagedHumanPatterns.some((pattern) => pattern.test(source))) {
    failures.push(
      "SYNTHETIC_OR_STAGED_HUMAN_BEHAVIOR_RISK",
    );
  }
  if (generatedTextPatterns.some((pattern) => pattern.test(source))) {
    failures.push(
      "GENERATED_OR_UNCONTROLLED_TEXT_REQUESTED",
    );
  }

  const narrativeSource = [
    scene.title,
    scene.objective,
    shot.title,
    shot.purpose,
    shot.story_purpose,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/arrival|approach|entrance|welcome/.test(narrativeSource)) {
    const actors = list(shot.actors);
    const staff = actors.find((actor) =>
      /staff|host|greeter|server|employee/.test(
        text(actor.narrative_role).toLowerCase(),
      ),
    );
    const guest = actors.find((actor) =>
      /guest|customer|visitor|couple|friend/.test(
        text(actor.narrative_role).toLowerCase(),
      ),
    );
    const staffText = [
      staff?.action,
      staff?.gaze_target,
      staff?.interaction_target,
      staff?.body_orientation,
    ].filter(Boolean).join(" ").toLowerCase();
    const guestText = [
      guest?.action,
      guest?.end_position,
      guest?.travel_direction,
      guest?.body_orientation,
    ].filter(Boolean).join(" ").toLowerCase();

    if (
      !staff ||
      !/greet|welcome|invite|gesture|receive/.test(staffText) ||
      !guest ||
      !/entrance|inside|interior|door|venue/.test(guestText)
    ) {
      failures.push(
        "ARRIVAL_HOSPITALITY_BLOCKING_REQUIRED",
      );
    }
  }

  const brandSource = [
    shot.title,
    shot.purpose,
    shot.story_purpose,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/brand|logo|closing/.test(brandSource)) {
    if (shot.provider_text_policy?.generate_text !== false) {
      failures.push(
        "PROVIDER_TEXT_GENERATION_MUST_BE_DISABLED",
      );
    }
    if (
      shot.provider_text_policy
        ?.controlled_composite_required !== true
    ) {
      failures.push(
        "CONTROLLED_BRAND_COMPOSITE_REQUIRED",
      );
    }
  }

  return unique(failures);
}

const OUTPUT_SHAPE = {
  result: {
    shot_repair: {
      scene_number: "number",
      shot_number: "number",
      story_purpose: "string",
      narrative_state_before: "string",
      narrative_state_after: "string",
      opening_frame: "string",
      closing_frame: "string",
      decisive_moment: "string",
      screen_direction: "string",
      environment_action: "string",
      foreground_action: "object",
      midground_action: "object",
      background_action: "object",
      action_beats: ["object"],
      actors: [
        {
          actor_id: "string",
          narrative_role: "string",
          count: "number",
          action: "string",
          start_position: "string",
          end_position: "string",
          travel_direction: "string",
          body_orientation: "string",
          gaze_target: "string",
          interaction_target: "string",
          expression: "string",
          wardrobe: "object",
          identity_reference_asset_ids: ["string"],
          must_be_visually_identifiable: "boolean",
        },
      ],
      subject_paths: ["object"],
      relationships: ["object"],
      performance_direction: "string",
      camera: "object",
      lighting: "object",
      products: ["object"],
      reference_asset_ids: ["string"],
      reference_grounding: "string",
      preserve_from_references: ["string"],
      may_interpret_creatively: ["string"],
      missing_evidence: ["string"],
      continuity: "object",
      reality_rules: "object",
      forbidden_interpretations: ["string"],
      negative_constraints: ["string"],
      still_frame_rules: ["string"],
      provider_text_policy: {
        generate_text: "boolean",
        controlled_composite_required: "boolean",
        approved_text_source_asset_ids: ["string"],
        instructions: "string",
      },
      post_production_overlays: ["object"],
      provider_brief: "string",
      qa_checks: ["string"],
      quality_requirements: "object",
      transition_in: "object",
      transition_out: "object",
      semantic_repair_notes: ["string"],
    },
  },
};

async function repairOneShot({
  organization_id,
  project,
  mission,
  assets,
  story,
  scene,
  shot,
  review,
  globalReview,
  sceneIndex,
  shotIndex,
}) {
  const sceneNumber = sceneIndex + 1;
  const shotNumber = shotIndex + 1;
  const reasoning = await reason({
    task: [
      "Act as a world-class executive creative director, blocking director, cinematographer, human-performance director, brand guardian and pre-production repair lead.",
      "Repair exactly one failed story-bible shot using the supplied semantic review as authoritative defect evidence.",
      "Preserve the immutable scene number, shot number, shot title, duration and overall story position. Return only shot_repair.",
      "Resolve every critical failure, deterministic warning, issue and required repair from the shot review, plus relevant global review findings.",
      "Describe one physically possible decisive static frame only. Remove every pan, zoom, dolly, focus pull, travel sequence, sound event, object journey, before-and-after state and simultaneous action that requires time to understand.",
      "Choose one visual instant. Objects may imply prior movement through position and natural blur, but the brief must not ask the provider to depict motion progression.",
      "For social scenes, assign one primary action and stagger all secondary reactions. No synchronized laughter, coordinated smiles, simultaneous toasts, unified clapping or model-like posing.",
      "Use asymmetrical body positions, different gaze targets, specific hand placement, realistic weight distribution, believable interpersonal distance and quiet micro-behavior.",
      "For arrival, approach, entrance or welcome scenes, visibly show guests moving toward the venue and a clearly identifiable staff member or host greeting, receiving or inviting them inside. Nobody may appear to leave or walk toward the camera.",
      "Use canonical project and mission truth for every proper name. Never misspell, abbreviate or invent brand text.",
      "The image provider must not generate captions, slogans, location text or typography. Brand text and exact logos must be applied through a controlled post-production composite from approved canonical assets.",
      "Set provider_text_policy.generate_text=false for brand or closing shots, controlled_composite_required=true, and list only approved text or logo source asset IDs.",
      "Use only canonical reference asset IDs. Exact grounding is allowed only where the asset directly supports the visible area, person, product, activity or brand claim.",
      "Write at least 1400 meaningful provider-brief characters, at least eight forbidden interpretations and at least twelve binary QA checks.",
      "Return strict JSON only. Generate no image, video, task or asset.",
    ].join(" "),
    input: {
      organization_id,
      requested_scene_number: sceneNumber,
      requested_shot_number: shotNumber,
      canonical_project_truth: {
        id: project.id,
        name: project.name,
        objective: project.objective,
        description: project.description,
        target_channels: project.target_channels,
        metadata: project.metadata,
      },
      canonical_mission_truth: {
        id: mission?.id || null,
        title: mission?.title || null,
        objective: mission?.objective || null,
        business_goal: mission?.business_goal || null,
        audience: mission?.audience || null,
        channels: mission?.channels || [],
        metadata: mission?.metadata || {},
      },
      complete_story_context: {
        title: story.title,
        logline: story.logline,
        objective: story.objective,
        story_thesis: story.story_thesis,
        brand_promise: story.brand_promise,
        emotional_arc: story.emotional_arc,
        scene_titles: list(story.scenes).map((item) => item.title),
      },
      immutable_scene: scene,
      failed_shot: shot,
      authoritative_shot_review: review,
      authoritative_global_review: globalReview,
      canonical_reference_assets:
        assets.map(compactAsset),
    },
    constraints: {
      planning_only: true,
      immutable_scene_number: sceneNumber,
      immutable_shot_number: shotNumber,
      immutable_title: shot.title,
      immutable_duration_seconds: Number(shot.duration_seconds || 0),
      resolve_all_review_failures: true,
      exact_reference_asset_ids_only: true,
      one_decisive_static_frame_only: true,
      no_motion_progression_language: true,
      no_synchronized_human_behavior: true,
      uncontrolled_text_forbidden: true,
      provider_brief_minimum_characters:
        MIN_PROVIDER_BRIEF_CHARACTERS,
      minimum_forbidden_interpretations:
        MIN_FORBIDDEN_INTERPRETATIONS,
      minimum_binary_qa_checks:
        MIN_BINARY_QA_CHECKS,
      image_generation_forbidden: true,
      video_generation_forbidden: true,
      production_task_creation_forbidden: true,
      asset_creation_forbidden: true,
      no_invented_factual_truth: true,
    },
    outputShape: OUTPUT_SHAPE,
    temperature: 0.08,
    maxOutputTokens: 14000,
    timeoutMs: 360000,
    metadata: {
      operation: "CREATIVE_DETAILED_STORY_SEMANTIC_SHOT_REPAIR",
      structured_output_name:
        "creative_detailed_story_semantic_shot_repair",
      structured_output_description:
        "One isolated semantic repair for one failed planned creative still shot",
      reasoning_quality_mode:
        "EXECUTIVE_SEMANTIC_REPAIR",
      scene_number: sceneNumber,
      shot_number: shotNumber,
    },
  });

  if (reasoning.fallback || reasoning.recovery) {
    throw repairError(
      "CREATIVE_SEMANTIC_SHOT_REPAIR_REASONING_FAILED",
      {
        scene_number: sceneNumber,
        shot_number: shotNumber,
        fallback_reason: reasoning.fallback_reason || null,
      },
    );
  }

  const repair = object(reasoning.result?.shot_repair);

  if (
    Number(repair.scene_number) !== sceneNumber ||
    Number(repair.shot_number) !== shotNumber
  ) {
    throw repairError(
      "CREATIVE_SEMANTIC_SHOT_REPAIR_KEY_MISMATCH",
      {
        expected: `${sceneNumber}:${shotNumber}`,
        actual: `${repair.scene_number}:${repair.shot_number}`,
      },
    );
  }

  return {
    key: `${sceneNumber}:${shotNumber}`,
    repair,
    provider: reasoning.provider || null,
    model: reasoning.model || null,
  };
}

async function mapWithConcurrency(items, worker, concurrency) {
  const output = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runWorker(),
    ),
  );

  return output;
}

function sanitizeActors(actors = [], canonicalIds) {
  return list(actors).map((actor) => ({
    ...actor,
    identity_reference_asset_ids:
      unique(
        list(actor.identity_reference_asset_ids).map(String),
      ).filter((id) => canonicalIds.has(id)),
  }));
}

function mergeShot({
  original,
  repair,
  canonicalIds,
  rejectedReferenceIds,
}) {
  const requestedReferences = unique(
    list(repair.reference_asset_ids).map(String),
  );
  const originalReferences = unique(
    list(original.reference_asset_ids).map(String),
  );
  const acceptedRequested = requestedReferences.filter(
    (id) => canonicalIds.has(id),
  );
  const acceptedOriginal = originalReferences.filter(
    (id) => canonicalIds.has(id),
  );
  const references = acceptedRequested.length
    ? acceptedRequested
    : acceptedOriginal;

  rejectedReferenceIds.push(
    ...requestedReferences.filter((id) => !canonicalIds.has(id)),
  );

  let grounding = text(
    repair.reference_grounding ||
    original.reference_grounding,
  ).toUpperCase();
  let missingEvidence = unique([
    ...list(original.missing_evidence),
    ...list(repair.missing_evidence),
  ]);

  if (!GROUNDING_LEVELS.has(grounding)) {
    grounding = references.length
      ? "PARTIALLY_REFERENCE_GROUNDED"
      : "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL";
  }

  if (
    grounding === "EXACT_REFERENCE_GROUNDED" &&
    !references.length
  ) {
    grounding = "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL";
    missingEvidence = unique([
      ...missingEvidence,
      "Exact visual evidence is unavailable for the claimed fidelity.",
    ]);
  }

  if (
    grounding === "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL" &&
    !missingEvidence.length
  ) {
    missingEvidence = [
      "Exact matching visual evidence is unavailable; approval is required before media generation.",
    ];
  }

  const forbidden = unique([
    ...list(original.forbidden_interpretations),
    ...list(original.negative_constraints),
    ...list(repair.forbidden_interpretations),
    ...list(repair.negative_constraints),
  ]);

  return {
    ...original,
    ...repair,
    title: original.title,
    duration_seconds: original.duration_seconds,
    actors: sanitizeActors(
      repair.actors?.length ? repair.actors : original.actors,
      canonicalIds,
    ),
    reference_asset_ids: references,
    reference_grounding: grounding,
    missing_evidence: missingEvidence,
    forbidden_interpretations: forbidden,
    negative_constraints: forbidden,
    qa_checks: unique([
      ...list(original.qa_checks),
      ...list(repair.qa_checks),
    ]),
    still_frame_rules: unique([
      ...list(original.still_frame_rules),
      ...list(repair.still_frame_rules),
      "RENDER_ONE_DECISIVE_STATIC_MOMENT_ONLY",
      "DO_NOT_REQUIRE_MULTIPLE_TIME_STATES_IN_ONE_IMAGE",
      "DO_NOT_GENERATE_CAPTIONS_SLOGANS_OR_LOCATION_TEXT",
    ]),
  };
}

function validateFinal({
  story,
  assets,
  sourceCounts,
  targetDuration,
  repairedKeys,
  expectedRepairKeys,
}) {
  const canonicalIds = new Set(
    assets.map(assetId).filter(Boolean),
  );
  const failures = [];
  const scenes = list(story.scenes);
  let shotCount = 0;
  let duration = 0;

  if (scenes.length !== sourceCounts.scene_count) {
    failures.push({
      code: "SOURCE_SCENE_COUNT_CHANGED",
      expected: sourceCounts.scene_count,
      actual: scenes.length,
    });
  }

  const missingRepairKeys = expectedRepairKeys.filter(
    (key) => !repairedKeys.includes(key),
  );

  if (missingRepairKeys.length) {
    failures.push({
      code: "SEMANTIC_SHOT_REPAIRS_MISSING",
      keys: missingRepairKeys,
    });
  }

  scenes.forEach((scene, sceneIndex) => {
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
      const shotFailures = [];
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

      if (Number(shot.shot_number) !== shotIndex + 1) {
        shotFailures.push({
          code: "SHOT_NUMBER_NOT_SEQUENTIAL",
          expected: shotIndex + 1,
        });
      }
      if (contract.completeness?.complete !== true) {
        shotFailures.push({
          code: "BLOCKING_CONTRACT_INCOMPLETE",
          details: contract.completeness,
        });
      }
      if (text(shot.provider_brief).length < MIN_PROVIDER_BRIEF_CHARACTERS) {
        shotFailures.push({
          code: "PROVIDER_BRIEF_TOO_SHORT",
          actual_characters: text(shot.provider_brief).length,
          minimum_characters: MIN_PROVIDER_BRIEF_CHARACTERS,
        });
      }
      if (list(shot.forbidden_interpretations).length < MIN_FORBIDDEN_INTERPRETATIONS) {
        shotFailures.push({
          code: "FORBIDDEN_INTERPRETATIONS_INSUFFICIENT",
          actual: list(shot.forbidden_interpretations).length,
          minimum: MIN_FORBIDDEN_INTERPRETATIONS,
        });
      }
      if (list(shot.qa_checks).length < MIN_BINARY_QA_CHECKS) {
        shotFailures.push({
          code: "QA_CHECKS_INSUFFICIENT",
          actual: list(shot.qa_checks).length,
          minimum: MIN_BINARY_QA_CHECKS,
        });
      }
      if (!GROUNDING_LEVELS.has(grounding)) {
        shotFailures.push({
          code: "REFERENCE_GROUNDING_INVALID",
          value: grounding || null,
        });
      }
      if (
        grounding === "EXACT_REFERENCE_GROUNDED" &&
        !references.length
      ) {
        shotFailures.push({
          code: "EXACT_GROUNDING_REFERENCE_REQUIRED",
        });
      }
      if (unknownReferences.length) {
        shotFailures.push({
          code: "UNKNOWN_REFERENCE_ASSET_IDS",
          asset_ids: unknownReferences,
        });
      }

      shotFailures.push(...semanticDeterministicFailures({
        scene,
        shot,
      }).map((code) => ({ code })));

      shot.blocking_contract = contract;

      if (shotFailures.length) {
        failures.push({
          scene_number: sceneIndex + 1,
          shot_number: shotIndex + 1,
          title: shot.title || null,
          failures: shotFailures,
        });
      }
    });
  });

  if (shotCount !== sourceCounts.shot_count) {
    failures.push({
      code: "SOURCE_SHOT_COUNT_CHANGED",
      expected: sourceCounts.shot_count,
      actual: shotCount,
    });
  }

  const roundedDuration = Math.round(duration * 1000) / 1000;

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

  return {
    passed: failures.length === 0,
    standard: {
      semantic_review_driven: true,
      isolated_shot_repairs: true,
      concurrency: CONCURRENCY,
      provider_brief_minimum_characters:
        MIN_PROVIDER_BRIEF_CHARACTERS,
      minimum_forbidden_interpretations:
        MIN_FORBIDDEN_INTERPRETATIONS,
      minimum_binary_qa_checks:
        MIN_BINARY_QA_CHECKS,
      duration_tolerance_seconds:
        DURATION_TOLERANCE_SECONDS,
    },
    scene_count: scenes.length,
    shot_count: shotCount,
    total_duration_seconds: roundedDuration,
    target_duration_seconds: targetDuration,
    failures,
  };
}

export const CreativeDetailedStorySemanticRepairRuntime = {
  async run({
    organization_id,
    creative_project_id,
    completed_result,
    semantic_review_result,
  } = {}) {
    if (!organization_id) {
      throw repairError("organization_id required");
    }
    if (!creative_project_id) {
      throw repairError("creative_project_id required");
    }

    const inputs = validateInputs({
      organization_id,
      creative_project_id,
      completed_result,
      semantic_review_result,
    });
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
    const story = clone(inputs.completed.story);
    const reviewMap = new Map(
      inputs.shot_reviews.map((review) => [
        reviewKey(review),
        review,
      ]),
    );
    const targets = [];

    list(story.scenes).forEach((scene, sceneIndex) => {
      list(scene.shots).forEach((shot, shotIndex) => {
        const key = shotKey(sceneIndex, shotIndex);
        const review = reviewMap.get(key);

        if (!review) {
          throw repairError(
            "CREATIVE_SEMANTIC_SHOT_REVIEW_MISSING",
            { key },
          );
        }

        if (
          review.passed !== true ||
          text(review.verdict).toUpperCase() !== "PASS" ||
          list(review.critical_failures).length > 0
        ) {
          targets.push({
            key,
            scene,
            shot,
            review,
            sceneIndex,
            shotIndex,
          });
        }
      });
    });

    const completed = await mapWithConcurrency(
      targets,
      (target) => repairOneShot({
        organization_id,
        project,
        mission,
        assets,
        story,
        globalReview: inputs.global_review,
        ...target,
      }),
      CONCURRENCY,
    );
    const repairMap = new Map(
      completed.map((entry) => [entry.key, entry]),
    );
    const rejectedReferenceIds = [];

    story.scenes = list(story.scenes).map(
      (scene, sceneIndex) => ({
        ...scene,
        scene_number: sceneIndex + 1,
        shots: list(scene.shots).map((shot, shotIndex) => {
          const key = shotKey(sceneIndex, shotIndex);
          const entry = repairMap.get(key);

          return {
            ...(entry
              ? mergeShot({
                  original: shot,
                  repair: entry.repair,
                  canonicalIds,
                  rejectedReferenceIds,
                })
              : shot),
            scene_number: sceneIndex + 1,
            shot_number: shotIndex + 1,
            title: shot.title,
            duration_seconds: shot.duration_seconds,
          };
        }),
      }),
    );

    const targetDuration = Number(
      inputs.completed.validation?.target_duration_seconds ||
      project.target_duration ||
      project.metadata?.specifications?.duration ||
      inputs.completed.validation?.total_duration_seconds ||
      0,
    ) || null;
    const expectedRepairKeys = targets.map((target) => target.key);
    const repairedKeys = completed.map((entry) => entry.key);
    const validation = validateFinal({
      story,
      assets,
      sourceCounts: {
        scene_count: inputs.scene_count,
        shot_count: inputs.shot_count,
      },
      targetDuration,
      repairedKeys,
      expectedRepairKeys,
    });

    return {
      success: validation.passed,
      preview_only: true,
      repair_only: true,
      preview_version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      creative_mission_id:
        mission?.id || missionId || null,
      source_completed_story_hash:
        inputs.completed_hash,
      source_scene_count: inputs.scene_count,
      source_shot_count: inputs.shot_count,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      assets_created: 0,
      story,
      validation,
      semantic_repair: {
        strategy:
          "ISOLATED_SEMANTIC_REVIEW_DRIVEN_SHOT_REPAIR",
        concurrency: CONCURRENCY,
        failed_shot_count: targets.length,
        repaired_shot_count: completed.length,
        repaired_shot_keys: repairedKeys,
        preserved_passed_shot_keys:
          inputs.shot_reviews
            .filter((review) => review.passed === true)
            .map(reviewKey),
        rejected_reference_asset_ids:
          unique(rejectedReferenceIds),
        remaining_deterministic_failure_count:
          validation.failures.length,
      },
      reasoning: {
        shots: completed.map((entry) => ({
          key: entry.key,
          provider: entry.provider,
          model: entry.model,
        })),
      },
      next_gate: validation.passed
        ? "DETAILED_STORY_SEMANTIC_REVIEW_REQUIRED"
        : "DETAILED_STORY_MANUAL_REVIEW_REQUIRED",
    };
  },
};
