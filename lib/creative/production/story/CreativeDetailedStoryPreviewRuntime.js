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
  CreativeShotDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeShotDirectorRuntime";

import {
  reason,
} from "@/lib/creative/reasoning/CreativeReasoningService";

import {
  compileCreativeShotBlockingContract,
} from "@/lib/creative/production/contracts/CreativeShotBlockingContract";

const PREVIEW_VERSION =
  "CREATIVE_DETAILED_STORY_PREVIEW_V1";

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

function assetIdentity(asset = {}) {
  return String(asset.id || asset.asset_id || "");
}

function usableVisualAsset(asset = {}) {
  if (!assetIdentity(asset) || asset.archived) return false;

  const source = [
    asset.asset_type,
    asset.mime_type,
    asset.metadata?.mime_type,
    asset.file_name,
    asset.file_url,
    asset.image_url,
    asset.url,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/audio\//.test(source)) return false;
  if (/video\//.test(source)) return false;
  if (/\.(mp3|wav|aac|m4a|flac|mp4|mov|webm|m4v)(?:\?|$)/.test(source)) {
    return false;
  }

  return Boolean(
    asset.file_url ||
    asset.image_url ||
    asset.thumbnail_url ||
    asset.url,
  );
}

function mergeAssets(...groups) {
  const byId = new Map();

  for (const group of groups) {
    for (const asset of group || []) {
      if (!usableVisualAsset(asset)) continue;
      const key = assetIdentity(asset);
      if (!byId.has(key)) byId.set(key, asset);
    }
  }

  return [...byId.values()].slice(0, 200);
}

function compactAsset(asset = {}) {
  return {
    id: asset.id || asset.asset_id || null,
    name:
      asset.name ||
      asset.title ||
      asset.file_name ||
      null,
    asset_type: asset.asset_type || asset.type || null,
    roles: [
      ...list(asset.reference_roles),
      ...list(asset.reference_role),
      ...list(asset.roles),
      ...list(asset.role),
      ...list(asset.metadata?.reference_roles),
      ...list(asset.metadata?.reference_role),
      ...list(asset.analysis?.reference_roles),
    ],
    tags: list(asset.tags).slice(0, 30),
    description:
      asset.description ||
      asset.caption ||
      asset.analysis?.summary ||
      null,
    approved_reference:
      asset.approved_reference === true ||
      String(asset.status || "").toUpperCase() === "APPROVED" ||
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

function projectBrief(project = {}, mission = {}) {
  const specifications = object(
    project.metadata?.specifications,
  );
  const deliverableMetadata = object(
    project.metadata?.deliverable_metadata,
  );
  const requiredStoryBeats =
    deliverableMetadata.scene_plan ||
    specifications.structure ||
    specifications.scene_plan ||
    mission.metadata?.scene_plan ||
    mission.metadata?.required_story_beats ||
    [];

  return {
    objective:
      project.objective ||
      project.description ||
      mission.objective ||
      "",
    business_goal:
      mission.business_goal ||
      project.metadata?.business_goal ||
      "",
    audience:
      mission.audience ||
      project.metadata?.audience ||
      {},
    duration_seconds: Number(
      project.target_duration ||
      specifications.duration ||
      mission.metadata?.duration_seconds ||
      30,
    ),
    target_channels:
      project.target_channels ||
      mission.channels ||
      [],
    target_languages:
      project.target_languages ||
      mission.metadata?.languages ||
      [],
    required_story_beats:
      Array.isArray(requiredStoryBeats)
        ? requiredStoryBeats
        : [],
    specifications,
    quality_policy:
      project.metadata?.quality_policy ||
      mission.metadata?.quality_policy ||
      {},
    production_mode:
      project.metadata?.production_mode ||
      mission.metadata?.production_mode ||
      "AI_NATIVE",
  };
}

async function resolveAssets({
  organization_id,
  creative_mission_id,
  creative_project_id,
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

function previewError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

async function createDetailedBible({
  organization_id,
  project,
  mission,
  assets,
  basePlan,
}) {
  const reasoning = await reason({
    task: [
      "Act as an elite creative director, screenwriter, commercial film director, blocking director, cinematographer, production designer, casting director, editor, continuity supervisor and visual QA architect.",
      "Transform the supplied base production bible into one exhaustive, provider-ready story bible while preserving valid business truth, duration, concept, required beats and exact canonical asset IDs.",
      "The result must make the complete story understandable to a human reviewer before any image or video is generated.",
      "Every scene must state its dramatic purpose, state before and after, emotion, evidence level and continuity.",
      "Every shot must describe one independently readable story event and one decisive still-frame moment.",
      "For every actor or important subject define narrative role, count, visible action, start position, destination, screen travel direction, body orientation, gaze, interaction target, expression and relationship to other subjects.",
      "Separate foreground, midground and background action. Explain how the frame reads instantly without captions.",
      "Opening frame, closing frame and decisive moment must agree. Camera language may describe composition and energy but may never replace or contradict human blocking.",
      "Classify every scene and shot as EXACT_REFERENCE_GROUNDED, PARTIALLY_REFERENCE_GROUNDED or CREATIVE_INTERPRETATION_REQUIRES_APPROVAL.",
      "When exact venue, identity, product or brand evidence is absent, declare missing evidence and creative interpretation instead of pretending exact fidelity.",
      "Use only asset IDs present in canonical_reference_assets. Never invent IDs, names, architecture, staff identity, products, offers or factual claims.",
      "Each shot provider_brief must be highly detailed and at least 900 characters.",
      "Each shot must include at least six forbidden interpretations and at least ten binary QA checks.",
      "Explicitly forbid opposite-action readings, ambiguous staff/customer roles, generic posing, reversed travel direction, conflicting eyelines and camera instructions that contradict subject action.",
      "Return the complete story bible as strict JSON only. Do not generate media. Do not create provider prompts outside the provider_brief fields.",
    ].join(" "),
    input: {
      organization_id,
      project: {
        id: project.id,
        name: project.name,
        objective: project.objective,
        description: project.description,
        target_duration: project.target_duration,
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
      base_production_bible: basePlan,
      canonical_reference_assets:
        assets.map(compactAsset),
    },
    constraints: {
      planning_only: true,
      image_generation_forbidden: true,
      video_generation_forbidden: true,
      exact_reference_asset_ids_only: true,
      preserve_target_duration: true,
      preserve_required_story_beats: true,
      no_generic_campaign_template: true,
      no_invented_factual_truth: true,
      provider_brief_minimum_characters_per_shot: 900,
      minimum_forbidden_interpretations_per_shot: 6,
      minimum_binary_qa_checks_per_shot: 10,
      reference_grounding_levels: [
        "EXACT_REFERENCE_GROUNDED",
        "PARTIALLY_REFERENCE_GROUNDED",
        "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL",
      ],
    },
    outputShape: STORY_OUTPUT_SHAPE,
    temperature: 0.35,
    maxOutputTokens: 32000,
    timeoutMs: 600000,
    metadata: {
      operation: "CREATIVE_DETAILED_STORY_PREVIEW",
      structured_output_name:
        "creative_detailed_story_preview",
      structured_output_description:
        "Complete provider-ready creative story bible with detailed blocking and QA contracts",
      reasoning_quality_mode: "HIGH_DETAIL_STORY_BIBLE",
    },
  });

  if (reasoning.fallback || reasoning.recovery) {
    throw previewError(
      "CREATIVE_DETAILED_STORY_REASONING_FAILED",
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

function validateStory(story = {}, canonicalAssets = []) {
  const canonicalIds = new Set(
    canonicalAssets.map(assetIdentity).filter(Boolean),
  );
  const failures = [];
  let shotCount = 0;
  let totalDuration = 0;

  for (const [sceneIndex, scene] of list(story.scenes).entries()) {
    const shots = list(scene?.shots);

    if (!shots.length) {
      failures.push({
        scene_number: scene.scene_number || sceneIndex + 1,
        code: "SCENE_SHOTS_REQUIRED",
      });
      continue;
    }

    for (const [shotIndex, shot] of shots.entries()) {
      shotCount += 1;
      totalDuration += Number(shot.duration_seconds || 0);

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
      const unknownReferences = list(
        shot.reference_asset_ids,
      )
        .map(String)
        .filter((id) => !canonicalIds.has(id));
      const shotFailures = [];

      if (contract.completeness?.complete !== true) {
        shotFailures.push({
          code: "BLOCKING_CONTRACT_INCOMPLETE",
          details: contract.completeness,
        });
      }
      if (providerBrief.length < 900) {
        shotFailures.push({
          code: "PROVIDER_BRIEF_TOO_SHORT",
          actual_characters: providerBrief.length,
          minimum_characters: 900,
        });
      }
      if (forbidden.length < 6) {
        shotFailures.push({
          code: "FORBIDDEN_INTERPRETATIONS_INSUFFICIENT",
          actual: forbidden.length,
          minimum: 6,
        });
      }
      if (qaChecks.length < 10) {
        shotFailures.push({
          code: "QA_CHECKS_INSUFFICIENT",
          actual: qaChecks.length,
          minimum: 10,
        });
      }
      if (unknownReferences.length) {
        shotFailures.push({
          code: "UNKNOWN_REFERENCE_ASSET_IDS",
          asset_ids: unknownReferences,
        });
      }

      if (shotFailures.length) {
        failures.push({
          scene_number: scene.scene_number || sceneIndex + 1,
          shot_number: shot.shot_number || shotIndex + 1,
          title: shot.title || null,
          failures: shotFailures,
        });
      }

      shot.blocking_contract = contract;
    }
  }

  return {
    passed: failures.length === 0,
    scene_count: list(story.scenes).length,
    shot_count: shotCount,
    total_duration_seconds:
      Math.round(totalDuration * 1000) / 1000,
    failures,
  };
}

export const CreativeDetailedStoryPreviewRuntime = {
  async run({
    organization_id,
    creative_project_id,
  } = {}) {
    if (!organization_id) {
      throw previewError("organization_id required");
    }
    if (!creative_project_id) {
      throw previewError("creative_project_id required");
    }

    const project = await CreativeProjectRuntime.get(
      creative_project_id,
    );

    if (
      !project ||
      String(project.organization_id) !== String(organization_id)
    ) {
      throw previewError(
        "CREATIVE_PROJECT_NOT_IN_ORGANIZATION",
      );
    }

    const missionId = projectMissionId(project);
    const mission = missionId
      ? await CreativeMissionRuntime.get(missionId)
      : null;
    const assets = await resolveAssets({
      organization_id,
      creative_mission_id: mission?.id || missionId,
      creative_project_id,
    });
    const brief = projectBrief(project, mission || {});
    const basePlan = await CreativeShotDirectorRuntime.direct({
      organization_id,
      organization: {},
      brand: {},
      industry: null,
      objective: brief.objective,
      brief,
      assets,
      requestedOutputs: [
        {
          id: project.id,
          title: project.name,
          medium:
            project.metadata?.creative_medium ||
            project.production_type,
          formats:
            project.metadata?.formats || [],
          channels:
            project.target_channels || [],
        },
      ],
      durationSeconds: brief.duration_seconds,
      platform:
        (project.target_channels || []).join(", ") ||
        "multi-channel",
      budgetMode:
        project.budget_profile ||
        "quality-first",
    });
    const detailed = await createDetailedBible({
      organization_id,
      project,
      mission,
      assets,
      basePlan,
    });
    const validation = validateStory(
      detailed.story,
      assets,
    );

    return {
      success: validation.passed,
      preview_only: true,
      preview_version: PREVIEW_VERSION,
      organization_id,
      creative_project_id,
      creative_mission_id: mission?.id || missionId || null,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      asset_count: assets.length,
      story: detailed.story,
      validation,
      reasoning: detailed.reasoning,
      next_gate: validation.passed
        ? "DETAILED_STORY_REVIEW_REQUIRED"
        : "DETAILED_STORY_REPAIR_REQUIRED",
    };
  },
};
