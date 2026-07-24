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
  "CREATIVE_DETAILED_STORY_SNAPSHOT_COMPLETION_V1";
const MIN_PROVIDER_BRIEF_CHARACTERS = 1400;
const MIN_FORBIDDEN_INTERPRETATIONS = 8;
const MIN_BINARY_QA_CHECKS = 12;
const DURATION_TOLERANCE_SECONDS = 0.1;
const CONCURRENCY = 2;

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
  source_result,
  partial_result,
}) {
  const source = object(source_result);
  const partial = object(partial_result);
  const sourceCounts = storyCounts(source.story);
  const partialCounts = storyCounts(partial.story);
  const sourceHash = hash(source);

  if (!source.preview_only || !partial.preview_only) {
    throw repairError(
      "CREATIVE_STORY_PREVIEW_RESULTS_REQUIRED",
    );
  }

  for (const candidate of [source, partial]) {
    if (
      String(candidate.organization_id || "") !==
      String(organization_id || "")
    ) {
      throw repairError(
        "CREATIVE_STORY_RESULT_ORGANIZATION_MISMATCH",
      );
    }
    if (
      String(candidate.creative_project_id || "") !==
      String(creative_project_id || "")
    ) {
      throw repairError(
        "CREATIVE_STORY_RESULT_PROJECT_MISMATCH",
      );
    }
  }

  if (
    partial.source_snapshot_hash &&
    String(partial.source_snapshot_hash) !== sourceHash
  ) {
    throw repairError(
      "CREATIVE_STORY_PARTIAL_SOURCE_HASH_MISMATCH",
      {
        expected: sourceHash,
        actual: partial.source_snapshot_hash,
      },
    );
  }

  if (
    sourceCounts.scene_count !== partialCounts.scene_count ||
    sourceCounts.shot_count !== partialCounts.shot_count
  ) {
    throw repairError(
      "CREATIVE_STORY_PARTIAL_STRUCTURE_MISMATCH",
      {
        source: sourceCounts,
        partial: partialCounts,
      },
    );
  }

  if (!sourceCounts.scene_count || !sourceCounts.shot_count) {
    throw repairError(
      "CREATIVE_STORY_SOURCE_STRUCTURE_REQUIRED",
    );
  }

  return {
    source,
    partial,
    source_hash: sourceHash,
    ...sourceCounts,
  };
}

function shotKey(sceneIndex, shotIndex) {
  return `${sceneIndex + 1}:${shotIndex + 1}`;
}

function shotDefects({ scene, shot, canonicalIds }) {
  const defects = [];
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

  if (contract.completeness?.complete !== true) {
    defects.push({
      code: "BLOCKING_CONTRACT_INCOMPLETE",
      details: contract.completeness,
    });
  }
  if (text(shot.provider_brief).length < MIN_PROVIDER_BRIEF_CHARACTERS) {
    defects.push({
      code: "PROVIDER_BRIEF_TOO_SHORT",
      actual_characters: text(shot.provider_brief).length,
      minimum_characters: MIN_PROVIDER_BRIEF_CHARACTERS,
    });
  }
  if (list(shot.forbidden_interpretations).length < MIN_FORBIDDEN_INTERPRETATIONS) {
    defects.push({
      code: "FORBIDDEN_INTERPRETATIONS_INSUFFICIENT",
      actual: list(shot.forbidden_interpretations).length,
      minimum: MIN_FORBIDDEN_INTERPRETATIONS,
    });
  }
  if (list(shot.qa_checks).length < MIN_BINARY_QA_CHECKS) {
    defects.push({
      code: "QA_CHECKS_INSUFFICIENT",
      actual: list(shot.qa_checks).length,
      minimum: MIN_BINARY_QA_CHECKS,
    });
  }
  if (!GROUNDING_LEVELS.has(grounding)) {
    defects.push({
      code: "REFERENCE_GROUNDING_INVALID",
      value: grounding || null,
    });
  }
  if (
    grounding === "EXACT_REFERENCE_GROUNDED" &&
    references.length < 1
  ) {
    defects.push({
      code: "EXACT_GROUNDING_REFERENCE_REQUIRED",
    });
  }
  if (
    grounding === "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL" &&
    list(shot.missing_evidence).length < 1
  ) {
    defects.push({
      code: "CREATIVE_INTERPRETATION_MISSING_EVIDENCE_REQUIRED",
    });
  }
  if (unknownReferences.length) {
    defects.push({
      code: "UNKNOWN_REFERENCE_ASSET_IDS",
      asset_ids: unknownReferences,
    });
  }

  return defects;
}

const SHOT_OUTPUT_SHAPE = {
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
      provider_brief: "string",
      qa_checks: ["string"],
      quality_requirements: "object",
      transition_in: "object",
      transition_out: "object",
    },
  },
};

async function repairOneShot({
  organization_id,
  project,
  mission,
  assets,
  scene,
  sourceShot,
  currentShot,
  sceneIndex,
  shotIndex,
  defects,
}) {
  const sceneNumber = sceneIndex + 1;
  const shotNumber = shotIndex + 1;
  const reasoning = await reason({
    task: [
      "Act as a world-class commercial film director, blocking director, cinematographer, production designer, continuity supervisor and strict visual QA architect.",
      "Repair exactly one immutable story-bible shot. Return only shot_repair for the requested scene_number and shot_number.",
      "Preserve the original shot title, narrative purpose, scene position and duration. Do not add, remove, merge, split or reorder anything.",
      "Write at least 1400 meaningful provider-brief characters describing one decisive static frame with precise foreground, midground, background, architecture, subject placement, body orientation, gaze, hand placement, weight distribution, micro-behavior, lighting, lens behavior, depth, texture, continuity and evidence rules.",
      "Include at least eight distinct forbidden interpretations and at least twelve binary QA checks.",
      "Opening frame, decisive moment, closing frame, subject paths, body orientation, gaze, interaction and screen direction must agree.",
      "Translate all motion concepts into the exact frozen instant to render. Do not ask a still image to depict a pan, zoom, focus pull, complete object journey, sound event or multiple time states.",
      "Arrival must read as travel toward the destination, never departure. Greeting must visibly distinguish staff or host from customers through position, wardrobe, action, gaze and interaction.",
      "Avoid generic posing, direct-to-camera faces, synchronized smiles, perfect model groups, waxy skin and vague laughter. Use natural asymmetry, task-focused eyelines, realistic interpersonal distance and specific micro-behavior.",
      "Do not invent architecture, staff identity, food, products, text, location claims, prices, offers, brand marks or asset IDs.",
      "Use only IDs present in canonical_reference_assets. Use EXACT_REFERENCE_GROUNDED only where those assets directly support the visible claim; otherwise downgrade and state missing evidence.",
      "Return strict JSON only. Generate no image, video, task or asset.",
    ].join(" "),
    input: {
      organization_id,
      requested_scene_number: sceneNumber,
      requested_shot_number: shotNumber,
      project: {
        id: project.id,
        name: project.name,
        objective: project.objective,
        description: project.description,
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
      immutable_scene_context: scene,
      immutable_source_shot: sourceShot,
      current_partial_shot: currentShot,
      defects_to_repair: defects,
      canonical_reference_assets:
        assets.map(compactAsset),
    },
    constraints: {
      planning_only: true,
      immutable_scene_number: sceneNumber,
      immutable_shot_number: shotNumber,
      immutable_title: sourceShot.title || currentShot.title || null,
      immutable_duration_seconds:
        Number(currentShot.duration_seconds || sourceShot.duration_seconds || 0),
      image_generation_forbidden: true,
      video_generation_forbidden: true,
      production_task_creation_forbidden: true,
      asset_creation_forbidden: true,
      exact_reference_asset_ids_only: true,
      provider_brief_minimum_characters:
        MIN_PROVIDER_BRIEF_CHARACTERS,
      minimum_forbidden_interpretations:
        MIN_FORBIDDEN_INTERPRETATIONS,
      minimum_binary_qa_checks:
        MIN_BINARY_QA_CHECKS,
      one_decisive_static_frame_only: true,
      no_invented_factual_truth: true,
    },
    outputShape: SHOT_OUTPUT_SHAPE,
    temperature: 0.12,
    maxOutputTokens: 12000,
    timeoutMs: 360000,
    metadata: {
      operation: "CREATIVE_DETAILED_STORY_ISOLATED_SHOT_REPAIR",
      structured_output_name:
        "creative_detailed_story_isolated_shot_repair",
      structured_output_description:
        "One exhaustive structure-locked repair for one creative story shot",
      reasoning_quality_mode:
        "WORLD_CLASS_ISOLATED_SHOT_REPAIR",
      scene_number: sceneNumber,
      shot_number: shotNumber,
    },
  });

  if (reasoning.fallback || reasoning.recovery) {
    throw repairError(
      "CREATIVE_ISOLATED_SHOT_REPAIR_REASONING_FAILED",
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
      "CREATIVE_ISOLATED_SHOT_REPAIR_KEY_MISMATCH",
      {
        expected: `${sceneNumber}:${shotNumber}`,
        actual: `${repair.scene_number}:${repair.shot_number}`,
      },
    );
  }

  return {
    key: `${sceneNumber}:${shotNumber}`,
    repair,
    reasoning: {
      provider: reasoning.provider || null,
      model: reasoning.model || null,
      token_budget: reasoning.token_budget || null,
      timeout_ms: reasoning.timeout_ms || null,
    },
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
      "Exact visual evidence is unavailable for the claimed scene fidelity.",
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
    ]),
  };
}

function validateFinal({
  story,
  assets,
  sourceCounts,
  targetDuration,
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
      const shotFailures = shotDefects({
        scene,
        shot,
        canonicalIds,
      });

      if (Number(shot.shot_number) !== shotIndex + 1) {
        shotFailures.push({
          code: "SHOT_NUMBER_NOT_SEQUENTIAL",
          expected: shotIndex + 1,
        });
      }

      shot.blocking_contract = compileCreativeShotBlockingContract({
        scene,
        shot,
      });

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

export const CreativeDetailedStorySnapshotCompletionRuntime = {
  async run({
    organization_id,
    creative_project_id,
    source_result,
    partial_result,
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
      source_result,
      partial_result,
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
    const story = clone(inputs.partial.story);
    const sourceStory = object(inputs.source.story);
    const targets = [];

    list(story.scenes).forEach((scene, sceneIndex) => {
      list(scene.shots).forEach((shot, shotIndex) => {
        const defects = shotDefects({
          scene,
          shot,
          canonicalIds,
        });

        if (defects.length) {
          targets.push({
            key: shotKey(sceneIndex, shotIndex),
            sceneIndex,
            shotIndex,
            scene,
            sourceShot:
              list(sourceStory.scenes)[sceneIndex]
                ?.shots?.[shotIndex] || shot,
            currentShot: shot,
            defects,
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
          const entry = repairMap.get(
            shotKey(sceneIndex, shotIndex),
          );

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
      inputs.partial.validation?.target_duration_seconds ||
      project.target_duration ||
      project.metadata?.specifications?.duration ||
      inputs.partial.validation?.total_duration_seconds ||
      0,
    ) || null;
    const validation = validateFinal({
      story,
      assets,
      sourceCounts: {
        scene_count: inputs.scene_count,
        shot_count: inputs.shot_count,
      },
      targetDuration,
    });

    return {
      success: validation.passed,
      preview_only: true,
      preview_version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      creative_mission_id:
        mission?.id || missionId || null,
      source_snapshot_hash: inputs.source_hash,
      source_scene_count: inputs.scene_count,
      source_shot_count: inputs.shot_count,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      assets_created: 0,
      asset_count: assets.length,
      story,
      validation,
      completion: {
        strategy: "ISOLATED_SHOT_REPAIR_TWO_AT_A_TIME",
        concurrency: CONCURRENCY,
        deficient_shot_count: targets.length,
        completed_shot_repair_count: completed.length,
        completed_shot_keys: completed.map((entry) => entry.key),
        rejected_reference_asset_ids:
          unique(rejectedReferenceIds),
        remaining_failure_count:
          validation.failures.length,
      },
      reasoning: {
        shots: completed.map((entry) => ({
          key: entry.key,
          ...entry.reasoning,
        })),
      },
      next_gate: validation.passed
        ? "DETAILED_STORY_REVIEW_REQUIRED"
        : "DETAILED_STORY_MANUAL_REVIEW_REQUIRED",
    };
  },
};
