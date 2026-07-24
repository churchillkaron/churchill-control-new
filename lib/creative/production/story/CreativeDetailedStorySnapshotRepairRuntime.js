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
  "CREATIVE_DETAILED_STORY_SNAPSHOT_REPAIR_V1";
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

function snapshotHash(sourceResult = {}) {
  return createHash("sha256")
    .update(JSON.stringify(sourceResult))
    .digest("hex");
}

function repairError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function validateSnapshot({
  source_result,
  organization_id,
  creative_project_id,
}) {
  const source = object(source_result);
  const story = object(source.story);
  const scenes = list(story.scenes);

  if (!source.preview_only) {
    throw repairError(
      "CREATIVE_STORY_PREVIEW_SNAPSHOT_REQUIRED",
    );
  }

  if (
    String(source.organization_id || "") !==
    String(organization_id || "")
  ) {
    throw repairError(
      "CREATIVE_STORY_SNAPSHOT_ORGANIZATION_MISMATCH",
    );
  }

  if (
    String(source.creative_project_id || "") !==
    String(creative_project_id || "")
  ) {
    throw repairError(
      "CREATIVE_STORY_SNAPSHOT_PROJECT_MISMATCH",
    );
  }

  if (!scenes.length) {
    throw repairError(
      "CREATIVE_STORY_SNAPSHOT_SCENES_REQUIRED",
    );
  }

  const shotCount = scenes.reduce(
    (total, scene) => total + list(scene.shots).length,
    0,
  );

  if (!shotCount) {
    throw repairError(
      "CREATIVE_STORY_SNAPSHOT_SHOTS_REQUIRED",
    );
  }

  return {
    source,
    story: clone(story),
    scene_count: scenes.length,
    shot_count: shotCount,
    hash: snapshotHash(source),
  };
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

function targetDuration(project = {}, source = {}) {
  const value = Number(
    project.target_duration ||
    project.metadata?.specifications?.duration ||
    source.validation?.target_duration_seconds ||
    source.validation?.total_duration_seconds ||
    0,
  );

  return Number.isFinite(value) && value > 0
    ? value
    : null;
}

function normalizeStructure(story = {}, duration = null) {
  const normalized = clone(story);
  const slots = [];

  normalized.scenes = list(normalized.scenes).map(
    (scene, sceneIndex) => {
      const shots = list(scene.shots).map(
        (shot, shotIndex) => {
          const seconds = Number(shot.duration_seconds || 0);
          const milliseconds = Number.isFinite(seconds) && seconds > 0
            ? Math.round(seconds * 1000)
            : 1000;

          slots.push({
            sceneIndex,
            shotIndex,
            milliseconds,
          });

          return {
            ...shot,
            shot_number: shotIndex + 1,
          };
        },
      );

      return {
        ...scene,
        scene_number: sceneIndex + 1,
        shots,
      };
    },
  );

  if (duration && slots.length) {
    const targetMilliseconds = Math.round(duration * 1000);
    const currentMilliseconds = slots.reduce(
      (total, slot) => total + slot.milliseconds,
      0,
    );
    const raw = slots.map(
      (slot) => slot.milliseconds * targetMilliseconds /
        currentMilliseconds,
    );
    const allocated = raw.map(
      (value) => Math.max(250, Math.floor(value)),
    );
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

  normalized.scenes = normalized.scenes.map((scene) => ({
    ...scene,
    duration_seconds:
      Math.round(
        list(scene.shots).reduce(
          (total, shot) =>
            total + Number(shot.duration_seconds || 0),
          0,
        ) * 1000,
      ) / 1000,
  }));

  return normalized;
}

function structureManifest(story = {}) {
  return list(story.scenes).map((scene, sceneIndex) => ({
    scene_number: sceneIndex + 1,
    title: scene.title || null,
    shot_count: list(scene.shots).length,
    shots: list(scene.shots).map((shot, shotIndex) => ({
      scene_number: sceneIndex + 1,
      shot_number: shotIndex + 1,
      title: shot.title || null,
      duration_seconds: Number(shot.duration_seconds || 0),
      reference_asset_ids:
        list(shot.reference_asset_ids).map(String),
    })),
  }));
}

const OUTPUT_SHAPE = {
  result: {
    shot_repairs: [
      {
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
    ],
    repair_summary: "object",
  },
};

async function repairShots({
  organization_id,
  project,
  mission,
  assets,
  story,
  source_validation,
  manifest,
}) {
  const reasoning = await reason({
    task: [
      "Act as the final senior commercial film director, script supervisor, blocking director, cinematographer, production designer, continuity supervisor and visual QA architect.",
      "Repair the supplied immutable story snapshot shot by shot without changing its structure.",
      "Return exactly one shot_repairs entry for every shot in immutable_structure_manifest using the exact scene_number and shot_number.",
      "Do not return scenes. Do not add, delete, merge, split, reorder or rename scenes or shots.",
      "Preserve each original shot purpose, narrative role and duration while improving ambiguity, human realism, evidence truth and provider detail.",
      "Every provider_brief must contain at least 1400 meaningful characters of visible, spatial, behavioral, photographic, continuity and evidence direction without padding.",
      "Every shot must contain at least eight distinct forbidden interpretations and at least twelve binary QA checks.",
      "Describe one decisive static frame only. Translate motion concepts into the exact frozen instant to render.",
      "Arrival must visibly read as travel toward the destination. Greeting must visibly distinguish staff or host from customers through position, wardrobe, action, gaze and interaction.",
      "Avoid generic posing, direct-to-camera faces, synchronized smiles, perfect model groups and vague 'laughing' without specific micro-behavior.",
      "Use natural asymmetry, believable weight distribution, task-focused eyelines, realistic interpersonal distance and specific hand placement.",
      "Do not ask a still image to show a pan, zoom, focus pull, complete object journey or several time states.",
      "Do not invent location text, prices, offers, architecture, products, staff identity, brand marks or asset IDs.",
      "Use only IDs present in canonical_reference_assets. Use EXACT_REFERENCE_GROUNDED only when those exact assets directly support the visible claim.",
      "Downgrade unsupported exact claims to PARTIALLY_REFERENCE_GROUNDED or CREATIVE_INTERPRETATION_REQUIRES_APPROVAL and state missing evidence.",
      "Return strict JSON only. Generate no image, video, production task or asset.",
    ].join(" "),
    input: {
      organization_id,
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
      immutable_structure_manifest: manifest,
      immutable_story_snapshot: story,
      source_validation,
      canonical_reference_assets:
        assets.map(compactAsset),
    },
    constraints: {
      planning_only: true,
      snapshot_locked: true,
      structure_locked: true,
      exact_repair_count:
        manifest.reduce(
          (total, scene) => total + scene.shot_count,
          0,
        ),
      maximum_repair_passes: 1,
      image_generation_forbidden: true,
      video_generation_forbidden: true,
      production_task_creation_forbidden: true,
      asset_creation_forbidden: true,
      exact_reference_asset_ids_only: true,
      provider_brief_minimum_characters_per_shot:
        MIN_PROVIDER_BRIEF_CHARACTERS,
      minimum_forbidden_interpretations_per_shot:
        MIN_FORBIDDEN_INTERPRETATIONS,
      minimum_binary_qa_checks_per_shot:
        MIN_BINARY_QA_CHECKS,
      one_decisive_static_frame_per_shot: true,
      no_invented_factual_truth: true,
    },
    outputShape: OUTPUT_SHAPE,
    temperature: 0.12,
    maxOutputTokens: 42000,
    timeoutMs: 600000,
    metadata: {
      operation: "CREATIVE_DETAILED_STORY_SNAPSHOT_REPAIR",
      structured_output_name:
        "creative_detailed_story_snapshot_repair",
      structured_output_description:
        "Snapshot-bound structure-locked repairs for every existing creative story shot",
      reasoning_quality_mode:
        "WORLD_CLASS_IMMUTABLE_SNAPSHOT_REPAIR",
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
    repairs: list(reasoning.result?.shot_repairs),
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

function repairKey(sceneNumber, shotNumber) {
  return `${Number(sceneNumber)}:${Number(shotNumber)}`;
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

function mergeRepairs({ story, repairs, assets }) {
  const canonicalIds = new Set(
    assets.map(assetId).filter(Boolean),
  );
  const expectedKeys = new Set();
  const repairMap = new Map();
  const duplicateKeys = [];
  const unknownKeys = [];
  const rejectedReferenceIds = [];

  list(story.scenes).forEach((scene, sceneIndex) => {
    list(scene.shots).forEach((shot, shotIndex) => {
      expectedKeys.add(repairKey(sceneIndex + 1, shotIndex + 1));
    });
  });

  for (const repair of repairs) {
    const key = repairKey(
      repair.scene_number,
      repair.shot_number,
    );

    if (!expectedKeys.has(key)) {
      unknownKeys.push(key);
      continue;
    }
    if (repairMap.has(key)) {
      duplicateKeys.push(key);
      continue;
    }

    repairMap.set(key, repair);
  }

  const merged = clone(story);

  merged.scenes = list(merged.scenes).map(
    (scene, sceneIndex) => ({
      ...scene,
      scene_number: sceneIndex + 1,
      shots: list(scene.shots).map((shot, shotIndex) => {
        const key = repairKey(sceneIndex + 1, shotIndex + 1);
        const repair = repairMap.get(key);

        if (!repair) {
          return {
            ...shot,
            shot_number: shotIndex + 1,
          };
        }

        const repairedReferences = unique(
          list(repair.reference_asset_ids).map(String),
        );
        const originalReferences = unique(
          list(shot.reference_asset_ids).map(String),
        );
        const acceptedRepaired = repairedReferences.filter(
          (id) => canonicalIds.has(id),
        );
        const acceptedOriginal = originalReferences.filter(
          (id) => canonicalIds.has(id),
        );
        const references = acceptedRepaired.length
          ? acceptedRepaired
          : acceptedOriginal;

        rejectedReferenceIds.push(
          ...repairedReferences.filter(
            (id) => !canonicalIds.has(id),
          ),
        );

        let grounding = text(
          repair.reference_grounding ||
          shot.reference_grounding ||
          scene.reference_grounding,
        ).toUpperCase();
        let missingEvidence = unique([
          ...list(shot.missing_evidence),
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
          grounding =
            "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL";
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
          ...list(shot.forbidden_interpretations),
          ...list(shot.negative_constraints),
          ...list(repair.forbidden_interpretations),
          ...list(repair.negative_constraints),
        ]);

        return {
          ...shot,
          ...repair,
          scene_number: sceneIndex + 1,
          shot_number: shotIndex + 1,
          title: shot.title,
          duration_seconds: shot.duration_seconds,
          actors: sanitizeActors(
            repair.actors?.length ? repair.actors : shot.actors,
            canonicalIds,
          ),
          reference_asset_ids: references,
          reference_grounding: grounding,
          missing_evidence: missingEvidence,
          forbidden_interpretations: forbidden,
          negative_constraints: forbidden,
          qa_checks: unique([
            ...list(shot.qa_checks),
            ...list(repair.qa_checks),
          ]),
          still_frame_rules: unique([
            ...list(shot.still_frame_rules),
            ...list(repair.still_frame_rules),
            "RENDER_ONE_DECISIVE_STATIC_MOMENT_ONLY",
            "DO_NOT_REQUIRE_MULTIPLE_TIME_STATES_IN_ONE_IMAGE",
          ]),
        };
      }),
    }),
  );

  return {
    story: merged,
    diagnostics: {
      expected_repair_count: expectedKeys.size,
      received_repair_count: repairs.length,
      accepted_repair_count: repairMap.size,
      missing_repair_keys: [...expectedKeys].filter(
        (key) => !repairMap.has(key),
      ),
      duplicate_repair_keys: unique(duplicateKeys),
      unknown_repair_keys: unique(unknownKeys),
      rejected_reference_asset_ids:
        unique(rejectedReferenceIds),
    },
  };
}

function validateFinal({
  story,
  assets,
  duration,
  sourceSceneCount,
  sourceShotCount,
  diagnostics,
}) {
  const canonicalIds = new Set(
    assets.map(assetId).filter(Boolean),
  );
  const failures = [];
  const scenes = list(story.scenes);
  let shotCount = 0;
  let totalDuration = 0;

  if (scenes.length !== sourceSceneCount) {
    failures.push({
      code: "SOURCE_SCENE_COUNT_CHANGED",
      expected: sourceSceneCount,
      actual: scenes.length,
    });
  }

  if (diagnostics.missing_repair_keys.length) {
    failures.push({
      code: "SHOT_REPAIRS_MISSING",
      keys: diagnostics.missing_repair_keys,
    });
  }
  if (diagnostics.duplicate_repair_keys.length) {
    failures.push({
      code: "SHOT_REPAIR_KEYS_DUPLICATED",
      keys: diagnostics.duplicate_repair_keys,
    });
  }
  if (diagnostics.unknown_repair_keys.length) {
    failures.push({
      code: "SHOT_REPAIR_KEYS_UNKNOWN",
      keys: diagnostics.unknown_repair_keys,
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
      totalDuration += Number(shot.duration_seconds || 0);
      const shotFailures = [];
      const contract = compileCreativeShotBlockingContract({
        scene,
        shot,
      });
      const providerBrief = text(shot.provider_brief);
      const forbidden = list(shot.forbidden_interpretations);
      const qaChecks = list(shot.qa_checks);
      const references = unique(
        list(shot.reference_asset_ids).map(String),
      );
      const grounding = text(
        shot.reference_grounding ||
        scene.reference_grounding,
      ).toUpperCase();
      const unknownReferences = references.filter(
        (id) => !canonicalIds.has(id),
      );

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
      if (
        grounding === "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL" &&
        !list(shot.missing_evidence).length
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

  if (shotCount !== sourceShotCount) {
    failures.push({
      code: "SOURCE_SHOT_COUNT_CHANGED",
      expected: sourceShotCount,
      actual: shotCount,
    });
  }

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
      snapshot_locked: true,
      structure_locked: true,
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

export const CreativeDetailedStorySnapshotRepairRuntime = {
  async run({
    organization_id,
    creative_project_id,
    source_result,
  } = {}) {
    if (!organization_id) {
      throw repairError("organization_id required");
    }
    if (!creative_project_id) {
      throw repairError("creative_project_id required");
    }

    const snapshot = validateSnapshot({
      source_result,
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
    const duration = targetDuration(project, snapshot.source);
    const sourceStory = normalizeStructure(
      snapshot.story,
      duration,
    );
    const manifest = structureManifest(sourceStory);
    const repaired = await repairShots({
      organization_id,
      project,
      mission,
      assets,
      story: sourceStory,
      source_validation:
        snapshot.source.validation || null,
      manifest,
    });
    const merged = mergeRepairs({
      story: sourceStory,
      repairs: repaired.repairs,
      assets,
    });
    const finalStory = normalizeStructure(
      merged.story,
      duration,
    );
    const validation = validateFinal({
      story: finalStory,
      assets,
      duration,
      sourceSceneCount: snapshot.scene_count,
      sourceShotCount: snapshot.shot_count,
      diagnostics: merged.diagnostics,
    });

    return {
      success: validation.passed,
      preview_only: true,
      preview_version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      creative_mission_id:
        mission?.id || missionId || null,
      source_snapshot_hash: snapshot.hash,
      source_scene_count: snapshot.scene_count,
      source_shot_count: snapshot.shot_count,
      source_preview_version:
        snapshot.source.preview_version || null,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      assets_created: 0,
      asset_count: assets.length,
      story: finalStory,
      validation,
      structure_manifest: manifest,
      merge_diagnostics: merged.diagnostics,
      reasoning: repaired.reasoning,
      repair: {
        attempted: true,
        strategy: "IMMUTABLE_SNAPSHOT_STRUCTURE_LOCKED_SHOT_REPAIR",
        maximum_repair_passes: 1,
        repair_passes_used: 1,
        source_scene_count: snapshot.scene_count,
        source_shot_count: snapshot.shot_count,
        repaired_scene_count: validation.scene_count,
        repaired_shot_count: validation.shot_count,
        rejected_reference_asset_ids:
          merged.diagnostics.rejected_reference_asset_ids,
        remaining_failure_count:
          validation.failures.length,
      },
      next_gate: validation.passed
        ? "DETAILED_STORY_REVIEW_REQUIRED"
        : "DETAILED_STORY_MANUAL_REVIEW_REQUIRED",
    };
  },
};
