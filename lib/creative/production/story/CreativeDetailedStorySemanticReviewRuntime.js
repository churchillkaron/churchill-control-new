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

const RUNTIME_VERSION =
  "CREATIVE_DETAILED_STORY_SEMANTIC_REVIEW_V1";
const SHOT_PASS_SCORE = 90;
const GLOBAL_PASS_SCORE = 90;
const CONCURRENCY = 2;

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

function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(value || {}))
    .digest("hex");
}

function reviewError(code, details = {}) {
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

function validateInput({
  completed_result,
  organization_id,
  creative_project_id,
}) {
  const result = object(completed_result);
  const story = object(result.story);
  const scenes = list(story.scenes);
  const shotCount = scenes.reduce(
    (total, scene) => total + list(scene.shots).length,
    0,
  );

  if (!result.preview_only) {
    throw reviewError(
      "CREATIVE_COMPLETED_STORY_PREVIEW_REQUIRED",
    );
  }
  if (
    String(result.organization_id || "") !==
    String(organization_id || "")
  ) {
    throw reviewError(
      "CREATIVE_COMPLETED_STORY_ORGANIZATION_MISMATCH",
    );
  }
  if (
    String(result.creative_project_id || "") !==
    String(creative_project_id || "")
  ) {
    throw reviewError(
      "CREATIVE_COMPLETED_STORY_PROJECT_MISMATCH",
    );
  }
  if (!scenes.length || !shotCount) {
    throw reviewError(
      "CREATIVE_COMPLETED_STORY_STRUCTURE_REQUIRED",
    );
  }

  return {
    result,
    story,
    scene_count: scenes.length,
    shot_count: shotCount,
    source_hash: hash(result),
  };
}

function deterministicWarnings(shot = {}) {
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
  const warnings = [];

  const generatedTextPatterns = [
    /location caption/,
    /location text/,
    /text below/,
    /generated typography/,
    /fully legible text/,
  ];
  const multiTimePatterns = [
    /focus pull/,
    /camera moves/,
    /camera tracks/,
    /slow pan/,
    /zoom[- ]?in/,
    /begins to drop/,
    /rolling toward/,
    /glides? in/,
    /wafting upward/,
    /about to clink/,
    /clapping in unison/,
  ];
  const syntheticHumanPatterns = [
    /synchronized laughter/,
    /all .*smil/,
    /perfect.*group/,
    /facing.*camera/,
  ];

  if (generatedTextPatterns.some((pattern) => pattern.test(source))) {
    warnings.push("GENERATED_OR_UNCONTROLLED_TEXT_REQUESTED");
  }
  if (multiTimePatterns.some((pattern) => pattern.test(source))) {
    warnings.push("MULTIPLE_TIME_STATES_OR_MOTION_LANGUAGE_IN_STILL");
  }
  if (syntheticHumanPatterns.some((pattern) => pattern.test(source))) {
    warnings.push("SYNTHETIC_OR_STAGED_HUMAN_BEHAVIOR_RISK");
  }

  return unique(warnings);
}

const SHOT_REVIEW_OUTPUT_SHAPE = {
  result: {
    scene_number: "number",
    shot_number: "number",
    verdict: "string",
    score: "number",
    summary: "string",
    dimensions: {
      narrative_truth: "number",
      action_readability: "number",
      role_readability: "number",
      static_frame_purity: "number",
      human_behavior_realism: "number",
      evidence_relevance: "number",
      brand_and_text_safety: "number",
      continuity: "number",
      provider_clarity: "number",
      premium_craft_potential: "number",
    },
    critical_failures: ["string"],
    issues: ["object"],
    required_repairs: ["string"],
    evidence_assessment: "object",
    approval_reason: "string",
  },
};

const GLOBAL_REVIEW_OUTPUT_SHAPE = {
  result: {
    verdict: "string",
    score: "number",
    summary: "string",
    dimensions: {
      story_arc: "number",
      required_beat_coverage: "number",
      emotional_progression: "number",
      scene_distinctiveness: "number",
      continuity: "number",
      pacing: "number",
      brand_truth: "number",
      evidence_honesty: "number",
      hospitality_story: "number",
      premium_campaign_potential: "number",
    },
    critical_failures: ["string"],
    missing_beats: ["string"],
    duplicated_beats: ["string"],
    continuity_breaks: ["string"],
    evidence_conflicts: ["string"],
    required_repairs: ["string"],
    approval_reason: "string",
  },
};

async function reviewShot({
  organization_id,
  project,
  mission,
  assets,
  story,
  scene,
  shot,
  sceneIndex,
  shotIndex,
}) {
  const sceneNumber = sceneIndex + 1;
  const shotNumber = shotIndex + 1;
  const deterministic = deterministicWarnings(shot);
  const referencedAssets = list(shot.reference_asset_ids)
    .map(String)
    .map((id) => assets.find((asset) => assetId(asset) === id))
    .filter(Boolean)
    .map(compactAsset);
  const reasoning = await reason({
    task: [
      "Act as an uncompromising executive creative director, script supervisor, blocking director, cinematographer, human-performance director, brand guardian and pre-production QA chair.",
      "Review exactly one planned still shot semantically. Do not rewrite it and do not reward length or checklist counts.",
      "Judge whether the visible frozen frame would unmistakably perform the intended story beat without captions.",
      "Fail when arrival can read as departure, greeting lacks a clearly identifiable host or staff role, people merely pose, roles are ambiguous, eyelines conflict, body direction contradicts destination, or the decisive moment contains several time states.",
      "Fail motion language that asks one still to show a pan, zoom, focus pull, object journey, sound event or before-and-after action simultaneously.",
      "Fail synthetic human behavior such as synchronized laughter, perfectly coordinated smiles, model-like posing, implausible hand contact, impossible anatomy or generic emotion without specific micro-behavior.",
      "Compare every EXACT_REFERENCE_GROUNDED claim with the supplied reference metadata. Exact grounding requires directly relevant evidence for the visible venue area, product, person, activity or brand claim.",
      "Fail invented, misspelled or uncontrolled text. Exact logos may be preserved from canonical logo evidence, but location captions, slogans or typography must be composed in a controlled post-production layer unless exact approved text evidence exists.",
      "Compare every brand spelling and named factual claim with the project, mission and asset metadata. Do not silently correct mistakes.",
      "A shot passes only with score at least 90, no critical failures, no opposite-action ambiguity, honest evidence and provider-ready semantic clarity.",
      "Return strict JSON only. Generate no media.",
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
      scene,
      shot,
      referenced_canonical_assets: referencedAssets,
      deterministic_warnings: deterministic,
    },
    constraints: {
      review_only: true,
      requested_scene_number: sceneNumber,
      requested_shot_number: shotNumber,
      pass_score_minimum: SHOT_PASS_SCORE,
      no_critical_failures_for_pass: true,
      fail_opposite_action_ambiguity: true,
      fail_uncontrolled_text: true,
      fail_unsupported_exact_grounding: true,
      fail_multiple_time_states_in_still: true,
      fail_synthetic_human_behavior: true,
      image_generation_forbidden: true,
      video_generation_forbidden: true,
    },
    outputShape: SHOT_REVIEW_OUTPUT_SHAPE,
    temperature: 0.05,
    maxOutputTokens: 8000,
    timeoutMs: 300000,
    metadata: {
      operation: "CREATIVE_DETAILED_STORY_SEMANTIC_SHOT_REVIEW",
      structured_output_name:
        "creative_detailed_story_semantic_shot_review",
      structured_output_description:
        "Strict semantic approval review for one planned creative still shot",
      reasoning_quality_mode: "EXECUTIVE_PREPRODUCTION_QA",
      scene_number: sceneNumber,
      shot_number: shotNumber,
    },
  });

  if (reasoning.fallback || reasoning.recovery) {
    throw reviewError(
      "CREATIVE_SEMANTIC_SHOT_REVIEW_FAILED",
      {
        scene_number: sceneNumber,
        shot_number: shotNumber,
        fallback_reason: reasoning.fallback_reason || null,
      },
    );
  }

  const review = object(reasoning.result);

  if (
    Number(review.scene_number) !== sceneNumber ||
    Number(review.shot_number) !== shotNumber
  ) {
    throw reviewError(
      "CREATIVE_SEMANTIC_SHOT_REVIEW_KEY_MISMATCH",
      {
        expected: `${sceneNumber}:${shotNumber}`,
        actual: `${review.scene_number}:${review.shot_number}`,
      },
    );
  }

  const criticalFailures = unique(review.critical_failures);
  const score = Number(review.score || 0);
  const requestedPass = text(review.verdict).toUpperCase() === "PASS";
  const passed =
    requestedPass &&
    score >= SHOT_PASS_SCORE &&
    criticalFailures.length === 0 &&
    deterministic.length === 0;

  return {
    ...review,
    scene_number: sceneNumber,
    shot_number: shotNumber,
    score,
    verdict: passed ? "PASS" : "FAIL",
    passed,
    critical_failures: unique([
      ...criticalFailures,
      ...deterministic,
    ]),
    deterministic_warnings: deterministic,
    provider: reasoning.provider || null,
    model: reasoning.model || null,
  };
}

async function reviewGlobalStory({
  organization_id,
  project,
  mission,
  assets,
  story,
  shotReviews,
}) {
  const reasoning = await reason({
    task: [
      "Act as an executive creative director, commercial film editor, brand strategist, hospitality storyteller and final pre-production approval board.",
      "Review the complete story as one campaign film. Do not rewrite it and do not reward structural validation alone.",
      "Judge whether the story has a coherent beginning, escalation, emotional peak and branded close, with distinct scenes rather than repeated smiling, laughing and toasting.",
      "Verify coverage of the business promise and required story beats present in project or mission metadata.",
      "Verify that arrival and hospitality are actually shown, not merely claimed; staff welcome must be visible where the narrative promises it.",
      "Identify duplicate social beats, missing venue experiences, abrupt transitions, implausible continuity, weak pacing, unsupported exact-reference claims and any scene that relies on generic AI advertising behavior.",
      "Treat the individual shot reviews as authoritative evidence. A global pass is impossible while any shot has a critical failure.",
      "A story passes only with score at least 90, no critical failures, all required beats represented, honest evidence and clear premium campaign potential.",
      "Return strict JSON only. Generate no media.",
    ].join(" "),
    input: {
      organization_id,
      canonical_project_truth: {
        id: project.id,
        name: project.name,
        objective: project.objective,
        description: project.description,
        target_duration: project.target_duration,
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
      story,
      shot_reviews: shotReviews,
      canonical_asset_manifest:
        assets.map(compactAsset),
    },
    constraints: {
      review_only: true,
      pass_score_minimum: GLOBAL_PASS_SCORE,
      no_critical_failures_for_pass: true,
      all_shots_must_pass: true,
      no_generic_campaign_template: true,
      evidence_honesty_required: true,
      image_generation_forbidden: true,
      video_generation_forbidden: true,
    },
    outputShape: GLOBAL_REVIEW_OUTPUT_SHAPE,
    temperature: 0.05,
    maxOutputTokens: 10000,
    timeoutMs: 360000,
    metadata: {
      operation: "CREATIVE_DETAILED_STORY_SEMANTIC_GLOBAL_REVIEW",
      structured_output_name:
        "creative_detailed_story_semantic_global_review",
      structured_output_description:
        "Executive semantic approval review for a complete creative story bible",
      reasoning_quality_mode: "EXECUTIVE_CAMPAIGN_APPROVAL_BOARD",
    },
  });

  if (reasoning.fallback || reasoning.recovery) {
    throw reviewError(
      "CREATIVE_SEMANTIC_GLOBAL_REVIEW_FAILED",
      {
        fallback_reason: reasoning.fallback_reason || null,
      },
    );
  }

  const review = object(reasoning.result);
  const criticalFailures = unique(review.critical_failures);
  const score = Number(review.score || 0);
  const failedShotCount = shotReviews.filter(
    (shot) => !shot.passed,
  ).length;
  const requestedPass = text(review.verdict).toUpperCase() === "PASS";
  const passed =
    requestedPass &&
    score >= GLOBAL_PASS_SCORE &&
    criticalFailures.length === 0 &&
    failedShotCount === 0;

  return {
    ...review,
    score,
    verdict: passed ? "PASS" : "FAIL",
    passed,
    critical_failures: criticalFailures,
    failed_shot_count: failedShotCount,
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

export const CreativeDetailedStorySemanticReviewRuntime = {
  async run({
    organization_id,
    creative_project_id,
    completed_result,
  } = {}) {
    if (!organization_id) {
      throw reviewError("organization_id required");
    }
    if (!creative_project_id) {
      throw reviewError("creative_project_id required");
    }

    const input = validateInput({
      completed_result,
      organization_id,
      creative_project_id,
    });
    const project = await CreativeProjectRuntime.get(
      creative_project_id,
    );

    if (
      !project ||
      String(project.organization_id) !== String(organization_id)
    ) {
      throw reviewError(
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
    const targets = [];

    list(input.story.scenes).forEach((scene, sceneIndex) => {
      list(scene.shots).forEach((shot, shotIndex) => {
        targets.push({
          scene,
          shot,
          sceneIndex,
          shotIndex,
        });
      });
    });

    const shotReviews = await mapWithConcurrency(
      targets,
      (target) => reviewShot({
        organization_id,
        project,
        mission,
        assets,
        story: input.story,
        ...target,
      }),
      CONCURRENCY,
    );
    const globalReview = await reviewGlobalStory({
      organization_id,
      project,
      mission,
      assets,
      story: input.story,
      shotReviews,
    });
    const failedShots = shotReviews.filter(
      (review) => !review.passed,
    );
    const passed =
      globalReview.passed &&
      failedShots.length === 0;

    return {
      success: passed,
      review_only: true,
      preview_only: true,
      review_version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      creative_mission_id:
        mission?.id || missionId || null,
      completed_story_hash: input.source_hash,
      scene_count: input.scene_count,
      shot_count: input.shot_count,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      assets_created: 0,
      semantic_review: {
        passed,
        shot_pass_score: SHOT_PASS_SCORE,
        global_pass_score: GLOBAL_PASS_SCORE,
        passed_shot_count:
          shotReviews.length - failedShots.length,
        failed_shot_count: failedShots.length,
        failed_shot_keys: failedShots.map(
          (review) =>
            `${review.scene_number}:${review.shot_number}`,
        ),
        global: globalReview,
        shots: shotReviews,
      },
      next_gate: passed
        ? "DETAILED_STORY_HUMAN_APPROVAL_REQUIRED"
        : "DETAILED_STORY_SEMANTIC_REPAIR_REQUIRED",
    };
  },
};
