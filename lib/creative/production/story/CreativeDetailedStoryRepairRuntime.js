import {
  CreativeDetailedStoryPreviewRuntime,
} from "@/lib/creative/production/story/CreativeDetailedStoryPreviewRuntime";

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

const REPAIR_VERSION =
  "CREATIVE_DETAILED_STORY_REPAIR_V1";
const MIN_PROVIDER_BRIEF_CHARACTERS = 1400;
const MIN_FORBIDDEN_INTERPRETATIONS = 8;
const MIN_BINARY_QA_CHECKS = 12;
const DURATION_TOLERANCE_SECONDS = 0.1;

const REFERENCE_GROUNDING_LEVELS = new Set([
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

function targetDuration(project = {}, initial = {}) {
  const value = Number(
    project.target_duration ||
    project.metadata?.specifications?.duration ||
    initial.validation?.total_duration_seconds ||
    0,
  );

  return Number.isFinite(value) && value > 0
    ? value
    : null;
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

const STORY_OUTPUT_SHAPE = {
  result: {
    title: "string",
    logline: "string",
    objective: "string",
    audience_truth: "string",
    story_thesis: "string",
    brand_promise: "string",
    emotional_arc: ["string"],
    story_sequence_summary: ["object"],
    evidence_strategy: "object",
    visual_motif: "string",
    sound_motif: "string",
    selected_concept: "object",
    scenes: [
      {
        scene_number: "number",
        title: "string",
        objective: "string",
        narrative_state_before: "string",
        narrative_state_after: "string",
        emotion: "string",
        duration_seconds: "number",
        location: "object",
        reference_grounding: "string",
        missing_evidence: ["string"],
        brand_rules: ["string"],
        visual_style: "object",
        camera_style: "object",
        audio_style: "object",
        continuity_in: "object",
        continuity_out: "object",
        shots: [
          {
            shot_number: "number",
            title: "string",
            purpose: "string",
            story_purpose: "string",
            narrative_state_before: "string",
            narrative_state_after: "string",
            duration_seconds: "number",
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
            provider_brief: "string",
            qa_checks: ["string"],
            quality_requirements: "object",
            transition_in: "object",
            transition_out: "object",
          },
        ],
      },
    ],
    final_quality_standard: "object",
    approval_summary: "object",
  },
};

function repairError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function normalizeStoryStructure(story = {}, duration = null) {
  const normalized = clone(story);
  const scenes = list(normalized.scenes);
  const slots = [];

  normalized.scenes = scenes.map((scene, sceneIndex) => {
    const shots = list(scene.shots).map((shot, shotIndex) => {
      const seconds = Number(shot.duration_seconds || 0);
      const milliseconds = Number.isFinite(seconds) && seconds > 0
        ? Math.round(seconds * 1000)
        : 0;

      if (milliseconds > 0) {
        slots.push({
          sceneIndex,
          shotIndex,
          milliseconds,
        });
      }

      return {
        ...shot,
        shot_number: shotIndex + 1,
      };
    });

    return {
      ...scene,
      scene_number: sceneIndex + 1,
      shots,
    };
  });

  if (duration && slots.length) {
    const targetMilliseconds = Math.round(duration * 1000);
    const currentMilliseconds = slots.reduce(
      (total, slot) => total + slot.milliseconds,
      0,
    );

    if (currentMilliseconds > 0) {
      const raw = slots.map(
        (slot) => slot.milliseconds * targetMilliseconds / currentMilliseconds,
      );
      const allocated = raw.map((value) => Math.max(250, Math.floor(value)));
      let difference = targetMilliseconds - allocated.reduce(
        (total, value) => total + value,
        0,
      );
      let cursor = 0;

      while (difference !== 0 && allocated.length) {
        const index = cursor % allocated.length;

        if (difference > 0) {
          allocated[index] += 1;
          difference -= 1;
        } else if (allocated[index] > 250) {
          allocated[index] -= 1;
          difference += 1;
        }

        cursor += 1;

        if (cursor > targetMilliseconds * 2) {
          throw repairError(
            "CREATIVE_STORY_DURATION_NORMALIZATION_FAILED",
          );
        }
      }

      slots.forEach((slot, index) => {
        normalized.scenes[slot.sceneIndex]
          .shots[slot.shotIndex]
          .duration_seconds = allocated[index] / 1000;
      });
    }
  }

  normalized.scenes = normalized.scenes.map((scene) => ({
    ...scene,
    duration_seconds:
      Math.round(
        list(scene.shots).reduce(
          (total, shot) => total + Number(shot.duration_seconds || 0),
          0,
        ) * 1000,
      ) / 1000,
  }));

  return normalized;
}

function validateStory(story = {}, assets = [], duration = null) {
  const canonicalIds = new Set(
    assets.map(assetId).filter(Boolean),
  );
  const failures = [];
  const scenes = list(story.scenes);
  let shotCount = 0;
  let totalDuration = 0;

  scenes.forEach((scene, sceneIndex) => {
    const sceneNumber = Number(scene.scene_number || 0);

    if (sceneNumber !== sceneIndex + 1) {
      failures.push({
        scene_number: sceneNumber || null,
        code: "SCENE_NUMBER_NOT_SEQUENTIAL",
        expected: sceneIndex + 1,
      });
    }

    const shots = list(scene.shots);
    if (!shots.length) {
      failures.push({
        scene_number: sceneIndex + 1,
        code: "SCENE_SHOTS_REQUIRED",
      });
      return;
    }

    shots.forEach((shot, shotIndex) => {
      shotCount += 1;
      totalDuration += Number(shot.duration_seconds || 0);
      const shotFailures = [];
      const contract = compileCreativeShotBlockingContract({
        scene,
        shot,
      });
      const providerBrief = text(shot.provider_brief);
      const forbidden = list(
        shot.forbidden_interpretations ||
        shot.negative_constraints,
      );
      const qaChecks = list(shot.qa_checks);
      const grounding = text(
        shot.reference_grounding ||
        scene.reference_grounding,
      ).toUpperCase();
      const references = list(shot.reference_asset_ids).map(String);
      const unknownReferences = references.filter(
        (id) => !canonicalIds.has(id),
      );

      if (Number(shot.shot_number || 0) !== shotIndex + 1) {
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
      if (providerBrief.length < MIN_PROVIDER_BRIEF_CHARACTERS) {
        shotFailures.push({
          code: "PROVIDER_BRIEF_TOO_SHORT",
          actual_characters: providerBrief.length,
          minimum_characters: MIN_PROVIDER_BRIEF_CHARACTERS,
        });
      }
      if (forbidden.length < MIN_FORBIDDEN_INTERPRETATIONS) {
        shotFailures.push({
          code: "FORBIDDEN_INTERPRETATIONS_INSUFFICIENT",
          actual: forbidden.length,
          minimum: MIN_FORBIDDEN_INTERPRETATIONS,
        });
      }
      if (qaChecks.length < MIN_BINARY_QA_CHECKS) {
        shotFailures.push({
          code: "QA_CHECKS_INSUFFICIENT",
          actual: qaChecks.length,
          minimum: MIN_BINARY_QA_CHECKS,
        });
      }
      if (!REFERENCE_GROUNDING_LEVELS.has(grounding)) {
        shotFailures.push({
          code: "REFERENCE_GROUNDING_INVALID",
          value: grounding || null,
        });
      }
      if (
        grounding === "EXACT_REFERENCE_GROUNDED" &&
        references.length < 1
      ) {
        shotFailures.push({
          code: "EXACT_GROUNDING_REFERENCE_REQUIRED",
        });
      }
      if (
        grounding === "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL" &&
        list(shot.missing_evidence).length < 1
      ) {
        shotFailures.push({
          code: "CREATIVE_INTERPRETATION_MISSING_EVIDENCE_REQUIRED",
        });
      }
      if (unknownReferences.length) {
        shotFailures.push({
          code: "UNKNOWN_REFERENCE_ASSET_IDS",
          asset_ids: unknownReferences,
        });
      }

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

  const roundedDuration = Math.round(totalDuration * 1000) / 1000;

  if (
    duration &&
    Math.abs(roundedDuration - duration) > DURATION_TOLERANCE_SECONDS
  ) {
    failures.push({
      code: "STORY_DURATION_DOES_NOT_MATCH_TARGET",
      target_duration_seconds: duration,
      actual_duration_seconds: roundedDuration,
      tolerance_seconds: DURATION_TOLERANCE_SECONDS,
    });
  }

  return {
    passed: failures.length === 0,
    standard: {
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
    target_duration_seconds: duration,
    failures,
  };
}

async function repairStory({
  organization_id,
  project,
  mission,
  assets,
  initialStory,
  validation,
  duration,
}) {
  const reasoning = await reason({
    task: [
      "Act as the final senior creative director, script supervisor, commercial film director, blocking director, cinematographer, production designer, continuity supervisor and visual QA architect.",
      "Repair the complete supplied story bible once, using the exact validation failures as mandatory defects to correct.",
      "Return the complete corrected story bible, not comments and not a patch.",
      "Preserve valid business truth, narrative concept, required story beats, factual constraints, brand constraints, exact canonical asset IDs and all successful detail.",
      "Normalize scene numbers sequentially from 1 and shot numbers sequentially inside every scene.",
      "Every shot provider_brief must contain at least 1400 meaningful characters of visible, spatial, behavioral, photographic, continuity and evidence direction. Do not pad with repetition.",
      "Every shot must contain at least eight distinct forbidden interpretations and at least twelve binary QA checks.",
      "Every shot must select one decisive static frame. Translate camera movement or subject motion into the precise visible instant to freeze; do not ask a still image to show an entire action sequence.",
      "Opening frame, decisive moment, closing frame, subject paths, body orientation, gaze, interaction and screen direction must agree.",
      "Any arrival event must visibly read as movement toward the destination and not departure. Any greeting must clearly distinguish host or staff from customer through position, action, gaze and interaction.",
      "Do not allow subjects to face the camera unless the story explicitly requires direct address. Prefer natural eyelines and task-focused behavior over promotional posing.",
      "Do not ask an image model to invent location text, offer text or unsupported typography. Exact brand marks must come from canonical references and controlled compositing when required.",
      "Use EXACT_REFERENCE_GROUNDED only when at least one exact canonical reference ID supports the visible claim. Otherwise downgrade to PARTIALLY_REFERENCE_GROUNDED or CREATIVE_INTERPRETATION_REQUIRES_APPROVAL and declare missing evidence.",
      "Never invent venue architecture, staff identity, products, prices, offers, legal claims or asset IDs.",
      "Preserve the target total duration and coherent pacing across all scenes and shots.",
      "Return strict JSON only. Generate no image, video, production task or asset.",
    ].join(" "),
    input: {
      organization_id,
      project: {
        id: project.id,
        name: project.name,
        objective: project.objective,
        description: project.description,
        target_duration_seconds: duration,
        target_channels: project.target_channels,
        metadata: project.metadata,
      },
      mission: {
        id: mission?.id || null,
        title: mission?.title || null,
        objective: mission?.objective || null,
        business_goal: mission?.business_goal || null,
        audience: mission?.audience || null,
        channels: mission?.channels || [],
        metadata: mission?.metadata || {},
      },
      invalid_story_bible: initialStory,
      validation_failures: validation.failures,
      canonical_reference_assets:
        assets.map(compactAsset),
    },
    constraints: {
      planning_only: true,
      maximum_repair_passes: 1,
      image_generation_forbidden: true,
      video_generation_forbidden: true,
      production_task_creation_forbidden: true,
      asset_creation_forbidden: true,
      exact_reference_asset_ids_only: true,
      preserve_target_duration_seconds: duration,
      provider_brief_minimum_characters_per_shot:
        MIN_PROVIDER_BRIEF_CHARACTERS,
      minimum_forbidden_interpretations_per_shot:
        MIN_FORBIDDEN_INTERPRETATIONS,
      minimum_binary_qa_checks_per_shot:
        MIN_BINARY_QA_CHECKS,
      sequential_scene_and_shot_numbers: true,
      one_decisive_static_frame_per_shot: true,
      no_generic_campaign_template: true,
      no_invented_factual_truth: true,
    },
    outputShape: STORY_OUTPUT_SHAPE,
    temperature: 0.18,
    maxOutputTokens: 42000,
    timeoutMs: 600000,
    metadata: {
      operation: "CREATIVE_DETAILED_STORY_REPAIR",
      structured_output_name:
        "creative_detailed_story_repair",
      structured_output_description:
        "One strict planning-only repair of a complete provider-ready creative story bible",
      reasoning_quality_mode:
        "WORLD_CLASS_STORY_BIBLE_REPAIR",
    },
  });

  if (reasoning.fallback || reasoning.recovery) {
    throw repairError(
      "CREATIVE_DETAILED_STORY_REPAIR_REASONING_FAILED",
      {
        fallback_reason: reasoning.fallback_reason || null,
      },
    );
  }

  return {
    story: object(reasoning.result),
    reasoning: {
      provider: reasoning.provider || null,
      model: reasoning.model || null,
      token_budget: reasoning.token_budget || null,
      timeout_ms: reasoning.timeout_ms || null,
      structured_output_contract:
        reasoning.structured_output_contract || null,
    },
  };
}

export const CreativeDetailedStoryRepairRuntime = {
  async run({
    organization_id,
    creative_project_id,
  } = {}) {
    const initial = await CreativeDetailedStoryPreviewRuntime.run({
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
    const duration = targetDuration(project, initial);
    const initialStory = normalizeStoryStructure(
      initial.story,
      duration,
    );
    const strictInitialValidation = validateStory(
      initialStory,
      assets,
      duration,
    );

    if (strictInitialValidation.passed) {
      return {
        ...initial,
        success: true,
        preview_only: true,
        preview_version: REPAIR_VERSION,
        story: initialStory,
        validation: strictInitialValidation,
        repair: {
          attempted: false,
          maximum_repair_passes: 1,
          repair_passes_used: 0,
        },
        media_generation_dispatched: false,
        image_generation_dispatched: false,
        video_generation_dispatched: false,
        production_tasks_created: 0,
        assets_created: 0,
        next_gate: "DETAILED_STORY_REVIEW_REQUIRED",
      };
    }

    const repaired = await repairStory({
      organization_id,
      project,
      mission,
      assets,
      initialStory,
      validation: strictInitialValidation,
      duration,
    });
    const repairedStory = normalizeStoryStructure(
      repaired.story,
      duration,
    );
    const validation = validateStory(
      repairedStory,
      assets,
      duration,
    );

    return {
      success: validation.passed,
      preview_only: true,
      preview_version: REPAIR_VERSION,
      organization_id,
      creative_project_id,
      creative_mission_id:
        mission?.id || missionId || null,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      assets_created: 0,
      asset_count: assets.length,
      story: repairedStory,
      validation,
      initial_validation: strictInitialValidation,
      reasoning: {
        initial: initial.reasoning || null,
        repair: repaired.reasoning,
      },
      repair: {
        attempted: true,
        maximum_repair_passes: 1,
        repair_passes_used: 1,
        initial_failure_count:
          strictInitialValidation.failures.length,
        remaining_failure_count:
          validation.failures.length,
      },
      next_gate: validation.passed
        ? "DETAILED_STORY_REVIEW_REQUIRED"
        : "DETAILED_STORY_MANUAL_REVIEW_REQUIRED",
    };
  },
};
