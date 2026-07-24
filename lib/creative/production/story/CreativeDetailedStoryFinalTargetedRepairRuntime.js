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
  CreativeDetailedStorySemanticRevalidationRuntimeV5,
} from "@/lib/creative/production/story/CreativeDetailedStorySemanticRevalidationRuntimeV5";

const RUNTIME_VERSION =
  "CREATIVE_DETAILED_STORY_FINAL_TARGETED_REPAIR_V1";
const CONCURRENCY = 2;
const MAX_TARGETS = 4;
const REQUIRED_REVALIDATION_VERSION =
  "CREATIVE_DETAILED_STORY_SEMANTIC_REVALIDATION_V5_FINAL_EVIDENCE";

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

function shotMap(story = {}) {
  const map = new Map();

  list(story.scenes).forEach((scene, sceneIndex) => {
    list(scene.shots).forEach((shot, shotIndex) => {
      map.set(`${sceneIndex + 1}:${shotIndex + 1}`, {
        scene,
        shot,
        sceneIndex,
        shotIndex,
      });
    });
  });

  return map;
}

function validateInputs({
  organization_id,
  creative_project_id,
  repaired_result,
  final_revalidation_result,
}) {
  const repaired = object(repaired_result);
  const revalidated = object(final_revalidation_result);
  const review = object(revalidated.revalidation);

  if (!repaired.preview_only || !repaired.repair_only) {
    throw runtimeError(
      "CREATIVE_REPAIRED_STORY_PREVIEW_REQUIRED",
    );
  }
  if (
    revalidated.revalidation_version !==
    REQUIRED_REVALIDATION_VERSION
  ) {
    throw runtimeError(
      "CREATIVE_FINAL_EVIDENCE_REVALIDATION_REQUIRED",
      {
        expected: REQUIRED_REVALIDATION_VERSION,
        actual: revalidated.revalidation_version || null,
      },
    );
  }
  if (revalidated.final_evidence_validation !== true) {
    throw runtimeError(
      "CREATIVE_FINAL_EVIDENCE_VALIDATION_FLAG_REQUIRED",
    );
  }

  for (const candidate of [repaired, revalidated]) {
    if (
      String(candidate.organization_id || "") !==
      String(organization_id || "")
    ) {
      throw runtimeError(
        "CREATIVE_FINAL_REPAIR_ORGANIZATION_MISMATCH",
      );
    }
    if (
      String(candidate.creative_project_id || "") !==
      String(creative_project_id || "")
    ) {
      throw runtimeError(
        "CREATIVE_FINAL_REPAIR_PROJECT_MISMATCH",
      );
    }
  }

  const failedKeys = unique(review.failed_shot_keys);

  if (!failedKeys.length) {
    throw runtimeError(
      "CREATIVE_FINAL_REPAIR_HAS_NO_FAILED_SHOTS",
    );
  }
  if (failedKeys.length > MAX_TARGETS) {
    throw runtimeError(
      "CREATIVE_FINAL_REPAIR_TARGET_LIMIT_EXCEEDED",
      {
        maximum: MAX_TARGETS,
        actual: failedKeys.length,
      },
    );
  }

  const reviewMap = new Map(
    list(review.shots).map((shotReview) => [
      text(shotReview.key),
      shotReview,
    ]),
  );
  const sourceMap = shotMap(repaired.story);
  const targets = failedKeys.map((key) => {
    const source = sourceMap.get(key);
    const shotReview = reviewMap.get(key);

    if (!source || !shotReview) {
      throw runtimeError(
        "CREATIVE_FINAL_REPAIR_TARGET_NOT_FOUND",
        { key },
      );
    }
    if (shotReview.passed === true) {
      throw runtimeError(
        "CREATIVE_FINAL_REPAIR_TARGET_ALREADY_PASSED",
        { key },
      );
    }

    const evidence = list(shotReview.failures)
      .flatMap((failure) => list(failure.evidence));

    if (!evidence.length) {
      throw runtimeError(
        "CREATIVE_FINAL_REPAIR_EVIDENCE_REQUIRED",
        { key },
      );
    }

    return {
      key,
      ...source,
      review: shotReview,
    };
  });

  return {
    repaired,
    revalidated,
    targets,
    failed_keys: failedKeys,
    source_map: sourceMap,
  };
}

const OUTPUT_SHAPE = {
  result: {
    replacement_fields: {
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
      actors: ["object"],
      subject_paths: ["object"],
      relationships: ["object"],
      performance_direction: "string",
      camera: "object",
      provider_brief: "string",
      qa_checks: ["string"],
      forbidden_interpretations: ["string"],
      negative_constraints: ["string"],
      still_frame_rules: ["string"],
      semantic_repair_notes: ["string"],
    },
  },
};

async function repairTarget({
  organization_id,
  project,
  mission,
  assets,
  story,
  target,
}) {
  const sceneNumber = target.sceneIndex + 1;
  const shotNumber = target.shotIndex + 1;
  const reasoning = await reason({
    task: [
      "Act as an elite pre-production repair director.",
      "Repair exactly one failed planned still shot from the quoted evidence supplied by the final evidence validator.",
      "This contract is industry-neutral. Derive all subject roles, objects, actions and factual truth only from the supplied project, mission, scene, shot and references.",
      "Preserve the immutable scene number, shot number, title, duration, reference asset IDs, evidence classification, products, lighting, text policy, overlays and overall story position.",
      "Return only replacement_fields.",
      "Resolve every quoted failure literally. Choose one decisive, physically possible frozen instant and one dominant visual action.",
      "Do not combine an initiating action with its later consequence. Do not show an object at two positions or two narrative beats in one image.",
      "Secondary subjects may react only if their reaction is already complete and visually subordinate to the dominant instant.",
      "Use static camera placement only. Do not request a pan, tilt, zoom, dolly, focus pull, object journey or temporal progression.",
      "Write positive visual direction first. Put prohibitions only in forbidden_interpretations and negative_constraints, not inside the positive provider brief.",
      "Keep human behavior asymmetrical, specific and physically credible where humans are present.",
      "Return strict JSON only. Generate no image, video, task or asset.",
    ].join(" "),
    input: {
      organization_id,
      requested_key: target.key,
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
        scene_titles: list(story.scenes).map((scene) => scene.title),
      },
      immutable_scene: target.scene,
      failed_shot: target.shot,
      authoritative_evidence_review: target.review,
      canonical_reference_assets: assets.map(compactAsset),
    },
    constraints: {
      planning_only: true,
      requested_scene_number: sceneNumber,
      requested_shot_number: shotNumber,
      immutable_title: target.shot.title,
      immutable_duration_seconds:
        Number(target.shot.duration_seconds || 0),
      immutable_reference_asset_ids:
        list(target.shot.reference_asset_ids).map(String),
      evidence_driven_only: true,
      one_decisive_static_frame_only: true,
      one_dominant_action_only: true,
      no_temporal_progression: true,
      no_camera_progression: true,
      no_media_generation: true,
      no_task_creation: true,
      no_asset_creation: true,
      no_invented_factual_truth: true,
    },
    outputShape: OUTPUT_SHAPE,
    temperature: 0.05,
    maxOutputTokens: 12000,
    timeoutMs: 360000,
    metadata: {
      operation:
        "CREATIVE_DETAILED_STORY_FINAL_EVIDENCE_TARGETED_REPAIR",
      structured_output_name:
        "creative_detailed_story_final_targeted_repair",
      structured_output_description:
        "One evidence-driven replacement for one failed planned still shot",
      reasoning_quality_mode:
        "FINAL_EVIDENCE_TARGETED_REPAIR",
      scene_number: sceneNumber,
      shot_number: shotNumber,
    },
  });

  if (reasoning.fallback || reasoning.recovery) {
    throw runtimeError(
      "CREATIVE_FINAL_TARGETED_REPAIR_REASONING_FAILED",
      {
        key: target.key,
        fallback_reason: reasoning.fallback_reason || null,
      },
    );
  }

  const replacement = object(
    reasoning.result?.replacement_fields,
  );

  if (
    Number(replacement.scene_number) !== sceneNumber ||
    Number(replacement.shot_number) !== shotNumber
  ) {
    throw runtimeError(
      "CREATIVE_FINAL_TARGETED_REPAIR_KEY_MISMATCH",
      {
        expected: target.key,
        actual: `${replacement.scene_number}:${replacement.shot_number}`,
      },
    );
  }

  return {
    key: target.key,
    replacement,
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
      output[index] = await worker(items[index]);
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

function mergeReplacement(original = {}, replacement = {}) {
  return {
    ...original,
    ...replacement,
    scene_number: original.scene_number,
    shot_number: original.shot_number,
    title: original.title,
    duration_seconds: original.duration_seconds,
    reference_asset_ids: clone(original.reference_asset_ids),
    reference_grounding: original.reference_grounding,
    preserve_from_references: clone(original.preserve_from_references),
    may_interpret_creatively: clone(original.may_interpret_creatively),
    missing_evidence: clone(original.missing_evidence),
    lighting: clone(original.lighting),
    products: clone(original.products),
    provider_text_policy: clone(original.provider_text_policy),
    post_production_overlays: clone(original.post_production_overlays),
    transition_in: clone(original.transition_in),
    transition_out: clone(original.transition_out),
  };
}

function preservationReport({
  beforeMap,
  afterMap,
  targetKeys,
}) {
  const targetSet = new Set(targetKeys);
  const preserved = [];
  const changedUnexpectedly = [];

  for (const [key, before] of beforeMap.entries()) {
    if (targetSet.has(key)) continue;
    const after = afterMap.get(key);
    const beforeHash = hash(before.shot);
    const afterHash = hash(after?.shot);

    if (beforeHash === afterHash) {
      preserved.push(key);
    } else {
      changedUnexpectedly.push({
        key,
        before_hash: beforeHash,
        after_hash: afterHash,
      });
    }
  }

  return {
    passed: changedUnexpectedly.length === 0,
    preserved_shot_keys: preserved,
    changed_unexpectedly: changedUnexpectedly,
  };
}

export const CreativeDetailedStoryFinalTargetedRepairRuntime = {
  async run({
    organization_id,
    creative_project_id,
    repaired_result,
    final_revalidation_result,
  } = {}) {
    if (!organization_id) {
      throw runtimeError("organization_id required");
    }
    if (!creative_project_id) {
      throw runtimeError("creative_project_id required");
    }

    const inputs = validateInputs({
      organization_id,
      creative_project_id,
      repaired_result,
      final_revalidation_result,
    });
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
    const story = clone(inputs.repaired.story);
    const repairs = await mapWithConcurrency(
      inputs.targets,
      (target) => repairTarget({
        organization_id,
        project,
        mission,
        assets,
        story,
        target,
      }),
      CONCURRENCY,
    );
    const repairMap = new Map(
      repairs.map((repair) => [repair.key, repair]),
    );

    story.scenes = list(story.scenes).map(
      (scene, sceneIndex) => ({
        ...scene,
        shots: list(scene.shots).map((shot, shotIndex) => {
          const key = `${sceneIndex + 1}:${shotIndex + 1}`;
          const repair = repairMap.get(key);
          return repair
            ? mergeReplacement(shot, repair.replacement)
            : shot;
        }),
      }),
    );

    const afterMap = shotMap(story);
    const preservation = preservationReport({
      beforeMap: inputs.source_map,
      afterMap,
      targetKeys: inputs.failed_keys,
    });

    if (!preservation.passed) {
      throw runtimeError(
        "CREATIVE_FINAL_REPAIR_CHANGED_PASSED_SHOTS",
        preservation,
      );
    }

    const candidate = {
      ...inputs.repaired,
      success: false,
      preview_only: true,
      repair_only: true,
      preview_version: RUNTIME_VERSION,
      story,
      final_targeted_repair: {
        source_revalidation_version:
          inputs.revalidated.revalidation_version,
        target_count: repairs.length,
        target_keys: inputs.failed_keys,
        preserved_shot_count:
          preservation.preserved_shot_keys.length,
        preserved_shot_keys:
          preservation.preserved_shot_keys,
      },
    };
    const finalValidation =
      await CreativeDetailedStorySemanticRevalidationRuntimeV5.run({
        organization_id,
        creative_project_id,
        repaired_result: candidate,
      });
    const success = finalValidation.success === true;

    return {
      ...candidate,
      success,
      final_targeted_repair: {
        ...candidate.final_targeted_repair,
        repaired_shot_count: repairs.length,
        repaired_shot_keys: repairs.map((repair) => repair.key),
        preservation_passed: preservation.passed,
        final_validation_passed: success,
      },
      final_revalidation: finalValidation,
      reasoning: {
        shots: repairs.map((repair) => ({
          key: repair.key,
          provider: repair.provider,
          model: repair.model,
        })),
      },
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      assets_created: 0,
      next_gate: success
        ? "DETAILED_STORY_HUMAN_APPROVAL_REQUIRED"
        : "DETAILED_STORY_MANUAL_REVIEW_REQUIRED",
    };
  },
};
