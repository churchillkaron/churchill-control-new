export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  CreativeDirectorJobRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorJobRuntime";

import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";

import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

const DIRECTOR_JOBS = "creative_director_jobs";

function list(value) {
  if (!value) return [];
  return Array.isArray(value)
    ? value.filter(Boolean)
    : [value];
}

function object(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value ?? null),
  );
}

function unique(values = []) {
  return [
    ...new Set(
      values
        .filter(Boolean)
        .map(String),
    ),
  ];
}

function meaningfulState(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return false;
  }

  if (typeof value === "string") {
    return Boolean(value.trim());
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  return true;
}

function referenceIdentifier(value) {
  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    const identifier = String(value).trim();
    return identifier || null;
  }

  const source = object(value);

  const identifier =
    source.id ||
    source.asset_id ||
    source.reference_asset_id ||
    source.identity_reference_asset_id ||
    source.canonical_reference_asset_id ||
    source.selected_reference_asset_id ||
    null;

  return identifier
    ? String(identifier)
    : null;
}

function referenceIdentifiers(values = []) {
  return unique(
    list(values)
      .map(referenceIdentifier)
      .filter(Boolean),
  );
}

function nestedReferenceIdentifiers(values = []) {
  return unique(
    list(values).flatMap((value) => {
      const source = object(value);

      return referenceIdentifiers([
        ...list(source.reference_asset_ids),
        ...list(source.identity_reference_asset_ids),
        ...list(source.canonical_reference_asset_ids),
        ...list(source.selected_reference_asset_ids),
        ...list(source.assets),
        source.reference_asset_id,
        source.identity_reference_asset_id,
        source.canonical_reference_asset_id,
        source.selected_reference_asset_id,
        source.asset_id,
      ]);
    }),
  );
}

function assignedShotReferenceIds(shot = {}) {
  const source = object(shot);
  const masterStill = object(source.master_still_contract);

  return unique([
    ...referenceIdentifiers(source.reference_asset_ids),
    ...referenceIdentifiers(source.assets),
    ...referenceIdentifiers(masterStill.reference_asset_ids),
    ...nestedReferenceIdentifiers(source.actors),
    ...nestedReferenceIdentifiers(source.subjects),
    ...nestedReferenceIdentifiers(source.objects_products),
    ...nestedReferenceIdentifiers(source.objects),
    ...nestedReferenceIdentifiers(source.products),
  ]);
}

function sameIdentifierSet(left = [], right = []) {
  const leftSet = new Set(unique(left));
  const rightSet = new Set(unique(right));

  if (leftSet.size !== rightSet.size) return false;

  return [...leftSet].every((value) =>
    rightSet.has(value),
  );
}

function numberedEntry(values, number, field) {
  const entries = list(values);

  return (
    entries.find((value) =>
      Number(object(value)[field]) === Number(number),
    ) ||
    entries[Number(number) - 1] ||
    null
  );
}

function temporalFailure(job = {}) {
  const failedStep = list(job.steps).find((step) =>
    step?.step_key === "temporal_shot_direction" &&
    step?.status === "FAILED",
  );

  return object(
    failedStep?.error ||
    job.error,
  );
}

async function directorJobRow({
  jobId,
  organizationId,
}) {
  const { data, error } = await supabaseAdmin
    .from(DIRECTOR_JOBS)
    .select(
      "id,organization_id,current_plan,asset_snapshot,pipeline_result",
    )
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  return data;
}

async function persistDirectorJobRecovery({
  jobId,
  organizationId,
  values,
}) {
  const { error } = await supabaseAdmin
    .from(DIRECTOR_JOBS)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("organization_id", organizationId);

  if (error) throw error;
}

async function materializeFailedTemporalReferences({
  jobId,
  organizationId,
}) {
  const hydrated = await CreativeDirectorJobRuntime.get({
    job_id: jobId,
    organization_id: organizationId,
    include_plan: true,
  });

  const failure = temporalFailure(hydrated);

  if (
    failure.code !==
    "CREATIVE_TEMPORAL_MASTER_STILL_REFERENCE_SET_INVALID"
  ) {
    return {
      applied: false,
      reason: "NO_RECOVERABLE_REFERENCE_FAILURE",
    };
  }

  const details = object(failure.details);
  const expected = referenceIdentifiers(details.expected);
  const received = referenceIdentifiers(details.received);

  if (expected.length || !received.length) {
    return {
      applied: false,
      reason: "REFERENCE_FAILURE_REQUIRES_HUMAN_REVIEW",
      expected,
      received,
    };
  }

  const row = await directorJobRow({
    jobId,
    organizationId,
  });

  const available = new Set(
    list(row.asset_snapshot)
      .map(referenceIdentifier)
      .filter(Boolean),
  );

  const unknown = received.filter((id) =>
    !available.has(id),
  );

  if (unknown.length) {
    const recoveryError = new Error(
      "CREATIVE_TEMPORAL_REFERENCE_RECOVERY_UNKNOWN_ASSET",
    );

    recoveryError.code =
      "CREATIVE_TEMPORAL_REFERENCE_RECOVERY_UNKNOWN_ASSET";

    recoveryError.details = {
      job_id: jobId,
      unknown_asset_ids: unknown,
      canonical_asset_ids: [...available],
    };

    throw recoveryError;
  }

  const sceneNumber = Number(details.scene_number);
  const shotNumber = Number(details.shot_number);

  const plan = clone(object(row.current_plan));

  const scene = numberedEntry(
    plan.scenes,
    sceneNumber,
    "scene_number",
  );

  const shot = numberedEntry(
    object(scene).shots,
    shotNumber,
    "shot_number",
  );

  if (!scene || !shot) {
    const recoveryError = new Error(
      "CREATIVE_TEMPORAL_REFERENCE_RECOVERY_SHOT_NOT_FOUND",
    );

    recoveryError.code =
      "CREATIVE_TEMPORAL_REFERENCE_RECOVERY_SHOT_NOT_FOUND";

    recoveryError.details = {
      job_id: jobId,
      scene_number: sceneNumber,
      shot_number: shotNumber,
    };

    throw recoveryError;
  }

  const assigned = assignedShotReferenceIds(shot);

  if (
    assigned.length &&
    !sameIdentifierSet(assigned, received)
  ) {
    return {
      applied: false,
      reason: "ASSIGNED_REFERENCE_SET_CONFLICT",
      assigned,
      received,
      scene_number: sceneNumber,
      shot_number: shotNumber,
    };
  }

  shot.reference_asset_ids = received;
  shot.assets = received;

  const pipeline = object(row.pipeline_result);
  const temporal = object(pipeline.temporal_direction);

  const partialShots = list(
    temporal.partial_shots,
  ).map((partialValue) => {
    const partial = object(partialValue);

    if (
      Number(partial.scene_number) !== sceneNumber ||
      Number(partial.shot_number) !== shotNumber
    ) {
      return partialValue;
    }

    const masterStill = object(
      partial.master_still_contract,
    );

    return {
      ...partial,
      reference_asset_ids: received,
      master_still_contract:
        Object.keys(masterStill).length
          ? {
              ...masterStill,
              reference_asset_ids: received,
            }
          : masterStill,
      reference_recovered_at:
        new Date().toISOString(),
    };
  });

  const recoveredAt = new Date().toISOString();

  const nextPipeline = {
    ...pipeline,
    temporal_direction: {
      ...temporal,
      partial_shots: partialShots,
      active_address:
        `${sceneNumber}:${shotNumber}`,
      active_scene_number: sceneNumber,
      active_shot_number: shotNumber,
      active_phase:
        "REFERENCE_SET_RECOVERED",
      recovered_reference_asset_ids:
        received,
      reference_recovered_at:
        recoveredAt,
      activity_updated_at:
        recoveredAt,
    },
  };

  await persistDirectorJobRecovery({
    jobId,
    organizationId,
    values: {
      current_plan: plan,
      pipeline_result: nextPipeline,
    },
  });

  return {
    applied: true,
    scene_number: sceneNumber,
    shot_number: shotNumber,
    reference_asset_ids: received,
    validation: {
      canonical_asset_snapshot_checked: true,
      assigned_reference_conflict_checked: true,
      production_bible_materialized: true,
      partial_checkpoint_materialized: true,
    },
  };
}

function keyframeStateFailureAddress(value) {
  const match = String(value || "").match(
    /^scene\s+(\d+)\s+shot\s+(\d+)\s+([a-z_]+)\s+track\s+(\d+):\s+keyframe state missing at\s+(\d+)ms$/i,
  );

  if (!match) return null;

  return {
    scene_number: Number(match[1]),
    shot_number: Number(match[2]),
    department: String(match[3]).toLowerCase(),
    track_number: Number(match[4]),
    at_ms: Number(match[5]),
  };
}

function deterministicInterpolatedState({
  track,
  keyframe,
  durationMs,
}) {
  const atMs = Number(keyframe.at_ms);
  const progress = durationMs > 0
    ? Math.max(
        0,
        Math.min(1, atMs / durationMs),
      )
    : 0;

  return {
    kind: "INTERPOLATED_TRACK_STATE",
    derivation:
      "LOCKED_ENDPOINT_INTERPOLATION",
    owner: track.owner || null,
    subject: track.subject || null,
    property: track.property || null,
    from_state: clone(track.initial_state),
    to_state: clone(track.final_state),
    at_ms: atMs,
    duration_ms: durationMs,
    progress: Math.round(progress * 1000000) / 1000000,
    interpolation:
      keyframe.interpolation ||
      track.interpolation ||
      "linear",
  };
}

async function materializeFailedTemporalKeyframeStates({
  jobId,
  organizationId,
}) {
  const hydrated = await CreativeDirectorJobRuntime.get({
    job_id: jobId,
    organization_id: organizationId,
    include_plan: true,
  });

  const failure = temporalFailure(hydrated);

  if (
    failure.code !==
    "CREATIVE_TEMPORAL_DEPARTMENT_REJECTED"
  ) {
    return {
      applied: false,
      reason: "NO_RECOVERABLE_KEYFRAME_STATE_FAILURE",
    };
  }

  const details = object(failure.details);
  const addresses = list(details.failures)
    .map(keyframeStateFailureAddress);

  if (
    !addresses.length ||
    addresses.some((address) => !address)
  ) {
    return {
      applied: false,
      reason: "DEPARTMENT_FAILURE_REQUIRES_REASONING_REPAIR",
      failures: list(details.failures),
    };
  }

  const sceneNumber = Number(details.scene_number);
  const shotNumber = Number(details.shot_number);
  const department = String(details.department || "").toLowerCase();

  const addressMismatch = addresses.some((address) =>
    address.scene_number !== sceneNumber ||
    address.shot_number !== shotNumber ||
    address.department !== department,
  );

  if (addressMismatch) {
    return {
      applied: false,
      reason: "KEYFRAME_FAILURE_ADDRESS_MISMATCH",
      scene_number: sceneNumber,
      shot_number: shotNumber,
      department,
      addresses,
    };
  }

  const row = await directorJobRow({
    jobId,
    organizationId,
  });

  const pipeline = object(row.pipeline_result);
  const temporal = object(pipeline.temporal_direction);
  let recoveredCount = 0;
  const recoveredAddresses = [];

  const partialShots = list(
    temporal.partial_shots,
  ).map((partialValue) => {
    const partial = object(partialValue);

    if (
      Number(partial.scene_number) !== sceneNumber ||
      Number(partial.shot_number) !== shotNumber
    ) {
      return partialValue;
    }

    const temporalContract = clone(
      object(partial.temporal_contract),
    );

    const departmentContract = object(
      temporalContract[department],
    );

    const durationMs = Number(
      temporalContract.duration_ms ||
      object(partial.master_still_contract).duration_ms ||
      0,
    );

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      const recoveryError = new Error(
        "CREATIVE_TEMPORAL_KEYFRAME_RECOVERY_DURATION_REQUIRED",
      );

      recoveryError.code =
        "CREATIVE_TEMPORAL_KEYFRAME_RECOVERY_DURATION_REQUIRED";

      recoveryError.details = {
        job_id: jobId,
        scene_number: sceneNumber,
        shot_number: shotNumber,
        department,
        received_duration_ms: durationMs,
      };

      throw recoveryError;
    }

    const tracks = list(
      departmentContract.tracks,
    ).map((trackValue, trackIndex) => {
      const track = object(trackValue);
      const trackNumber = Number(
        track.track_number ||
        trackIndex + 1,
      );

      const requiredTimes = new Set(
        addresses
          .filter((address) =>
            address.track_number === trackNumber,
          )
          .map((address) => address.at_ms),
      );

      if (!requiredTimes.size) return trackValue;

      if (
        !meaningfulState(track.initial_state) ||
        !meaningfulState(track.final_state)
      ) {
        const recoveryError = new Error(
          "CREATIVE_TEMPORAL_KEYFRAME_RECOVERY_ENDPOINTS_REQUIRED",
        );

        recoveryError.code =
          "CREATIVE_TEMPORAL_KEYFRAME_RECOVERY_ENDPOINTS_REQUIRED";

        recoveryError.details = {
          job_id: jobId,
          scene_number: sceneNumber,
          shot_number: shotNumber,
          department,
          track_number: trackNumber,
          initial_state_present:
            meaningfulState(track.initial_state),
          final_state_present:
            meaningfulState(track.final_state),
        };

        throw recoveryError;
      }

      const keyframes = list(
        track.keyframes,
      ).map((keyframeValue) => {
        const keyframe = object(keyframeValue);
        const atMs = Number(keyframe.at_ms);

        if (!requiredTimes.has(atMs)) {
          return keyframeValue;
        }

        if (
          atMs <= 0 ||
          atMs >= durationMs
        ) {
          const recoveryError = new Error(
            "CREATIVE_TEMPORAL_KEYFRAME_RECOVERY_INTERMEDIATE_ONLY",
          );

          recoveryError.code =
            "CREATIVE_TEMPORAL_KEYFRAME_RECOVERY_INTERMEDIATE_ONLY";

          recoveryError.details = {
            job_id: jobId,
            scene_number: sceneNumber,
            shot_number: shotNumber,
            department,
            track_number: trackNumber,
            at_ms: atMs,
            duration_ms: durationMs,
          };

          throw recoveryError;
        }

        if (meaningfulState(keyframe.state)) {
          requiredTimes.delete(atMs);
          return keyframeValue;
        }

        const state = deterministicInterpolatedState({
          track,
          keyframe,
          durationMs,
        });

        recoveredCount += 1;
        recoveredAddresses.push({
          scene_number: sceneNumber,
          shot_number: shotNumber,
          department,
          track_number: trackNumber,
          at_ms: atMs,
          progress: state.progress,
        });

        requiredTimes.delete(atMs);

        return {
          ...keyframe,
          state,
          state_source:
            "LOCKED_ENDPOINT_INTERPOLATION",
          state_recovered_at:
            new Date().toISOString(),
        };
      });

      if (requiredTimes.size) {
        const recoveryError = new Error(
          "CREATIVE_TEMPORAL_KEYFRAME_RECOVERY_ADDRESS_NOT_FOUND",
        );

        recoveryError.code =
          "CREATIVE_TEMPORAL_KEYFRAME_RECOVERY_ADDRESS_NOT_FOUND";

        recoveryError.details = {
          job_id: jobId,
          scene_number: sceneNumber,
          shot_number: shotNumber,
          department,
          track_number: trackNumber,
          missing_at_ms: [...requiredTimes],
        };

        throw recoveryError;
      }

      return {
        ...track,
        keyframes,
      };
    });

    temporalContract[department] = {
      ...departmentContract,
      tracks,
    };

    return {
      ...partial,
      temporal_contract: temporalContract,
      keyframe_state_recovery: {
        department,
        recovered_count: recoveredCount,
        recovered_addresses: recoveredAddresses,
        method:
          "LOCKED_ENDPOINT_INTERPOLATION",
        recovered_at:
          new Date().toISOString(),
      },
      updated_at:
        new Date().toISOString(),
    };
  });

  if (recoveredCount !== addresses.length) {
    return {
      applied: false,
      reason: "KEYFRAME_RECOVERY_COUNT_MISMATCH",
      expected_count: addresses.length,
      recovered_count: recoveredCount,
      recovered_addresses: recoveredAddresses,
    };
  }

  const recoveredAt = new Date().toISOString();

  const nextPipeline = {
    ...pipeline,
    temporal_direction: {
      ...temporal,
      partial_shots: partialShots,
      active_address:
        `${sceneNumber}:${shotNumber}`,
      active_scene_number: sceneNumber,
      active_shot_number: shotNumber,
      active_phase:
        `DEPARTMENT_${department}_KEYFRAME_STATES_RECOVERED`,
      keyframe_state_recovery: {
        scene_number: sceneNumber,
        shot_number: shotNumber,
        department,
        recovered_count: recoveredCount,
        recovered_addresses: recoveredAddresses,
        method:
          "LOCKED_ENDPOINT_INTERPOLATION",
        recovered_at: recoveredAt,
      },
      activity_updated_at: recoveredAt,
    },
  };

  await persistDirectorJobRecovery({
    jobId,
    organizationId,
    values: {
      pipeline_result: nextPipeline,
    },
  });

  return {
    applied: true,
    scene_number: sceneNumber,
    shot_number: shotNumber,
    department,
    recovered_count: recoveredCount,
    recovered_addresses: recoveredAddresses,
    validation: {
      exact_failure_addresses_required: true,
      intermediate_keyframes_only: true,
      initial_state_required: true,
      final_state_required: true,
      endpoint_decisions_preserved: true,
      validator_unchanged: true,
    },
  };
}

function projectBrief(project = {}, mission = {}, body = {}) {
  const specifications = project.metadata?.specifications || {};
  const scenePlan =
    project.metadata?.deliverable_metadata?.scene_plan ||
    specifications.structure ||
    specifications.scene_plan ||
    [];

  return {
    ...(body.brief || {}),
    objective:
      body.brief?.objective ||
      project.objective ||
      project.description ||
      mission.objective ||
      "",
    business_goal:
      body.brief?.business_goal ||
      mission.business_goal ||
      "",
    duration_seconds: Number(
      body.duration_seconds ||
      project.target_duration ||
      specifications.duration ||
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
    required_story_beats: Array.isArray(scenePlan)
      ? scenePlan
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

function usableReferenceAsset(asset = {}) {
  if (!asset?.id || asset.archived) return false;

  const description = [
    asset.asset_type,
    asset.mime_type,
    asset.metadata?.mime_type,
    asset.file_name,
    asset.file_url,
    asset.image_url,
    asset.url,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/audio\//.test(description)) return false;
  if (/\.(mp3|wav|aac|m4a|flac)(?:\?|$)/.test(description)) {
    return false;
  }

  return Boolean(
    asset.file_url ||
    asset.image_url ||
    asset.thumbnail_url ||
    asset.url,
  );
}

function assetRank(asset = {}) {
  let score = 0;
  if (!asset.ai_generated) score += 100;
  if (asset.favorite) score += 30;
  if (asset.analysis && Object.keys(asset.analysis).length) score += 20;
  if (Array.isArray(asset.tags) && asset.tags.length) score += 10;
  if (asset.name || asset.title || asset.file_name) score += 5;
  score += Math.min(
    25,
    Number(asset.performance_score || asset.score || 0),
  );
  return score;
}

function mergeAssets(...groups) {
  const byId = new Map();

  for (const group of groups) {
    for (const asset of group || []) {
      if (!usableReferenceAsset(asset)) continue;
      const existing = byId.get(String(asset.id));
      if (!existing || assetRank(asset) > assetRank(existing)) {
        byId.set(String(asset.id), asset);
      }
    }
  }

  return [...byId.values()]
    .sort((left, right) => assetRank(right) - assetRank(left))
    .slice(0, 200);
}

async function resolvePlanningAssets({
  organizationId,
  missionId,
  projectId,
}) {
  const [projectAssets, missionAssets] = await Promise.all([
    CreativeAssetsRuntime.list({
      organization_id: organizationId,
      creative_project_id: projectId,
      limit: 200,
    }),
    CreativeAssetsRuntime.list({
      organization_id: organizationId,
      creative_mission_id: missionId,
      limit: 200,
    }),
  ]);

  let organizationAssets = [];
  if (!projectAssets.length || !missionAssets.length) {
    organizationAssets = await CreativeAssetsRuntime.list({
      organization_id: organizationId,
      limit: 200,
    });
  }

  return {
    assets: mergeAssets(
      projectAssets,
      missionAssets,
      organizationAssets,
    ),
    source: projectAssets.length
      ? "PROJECT"
      : missionAssets.length
        ? "MISSION"
        : organizationAssets.length
          ? "ORGANIZATION_REFERENCE_POOL"
          : "NONE",
    project_asset_count: projectAssets.length,
    mission_asset_count: missionAssets.length,
    organization_asset_count: organizationAssets.length,
  };
}

function errorStatus(error = {}) {
  const code = String(
    error.code ||
    error.message ||
    "",
  ).toUpperCase();

  if (
    code.includes("REQUIRED") ||
    code.includes("INVALID")
  ) {
    return 400;
  }
  if (code.includes("NOT_IN_ORGANIZATION")) return 404;
  if (code.includes("ALREADY_RUNNING")) return 409;
  if (
    code.includes("REJECTED") ||
    code.includes("DID_NOT_IMPROVE")
  ) {
    return 422;
  }
  return 500;
}

async function accessFor(organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
  });

  if (!access.success) {
    return {
      response: NextResponse.json(access, {
        status: access.status,
      }),
    };
  }

  return { access };
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const organizationId =
      url.searchParams.get("organization_id") ||
      null;
    const jobId = url.searchParams.get("job_id") || null;
    const includePlan =
      url.searchParams.get("include_plan") === "true";

    const checked = await accessFor(organizationId);
    if (checked.response) return checked.response;
    if (!jobId) {
      return NextResponse.json({
        success: false,
        error: "job_id required",
      }, { status: 400 });
    }

    const job = await CreativeDirectorJobRuntime.get({
      job_id: jobId,
      organization_id: organizationId,
      include_plan: includePlan,
    });

    return NextResponse.json({
      success: true,
      plan_only: true,
      production_dispatched: false,
      image_generation_started: false,
      video_generation_started: false,
      job,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code || null,
      details: error.details || null,
    }, { status: errorStatus(error) });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const organizationId =
      body.organization_id ||
      body.organizationId ||
      null;
    const action = String(body.action || "create").toLowerCase();

    const checked = await accessFor(organizationId);
    if (checked.response) return checked.response;

    if (action === "advance") {
      if (!body.job_id) {
        return NextResponse.json({
          success: false,
          error: "job_id required",
        }, { status: 400 });
      }

      const retryRequested =
        body.retry_failed === true;

      const referenceRecovery = retryRequested
        ? await materializeFailedTemporalReferences({
            jobId: body.job_id,
            organizationId,
          })
        : {
            applied: false,
            reason: "RETRY_NOT_REQUESTED",
          };

      const keyframeStateRecovery = retryRequested
        ? await materializeFailedTemporalKeyframeStates({
            jobId: body.job_id,
            organizationId,
          })
        : {
            applied: false,
            reason: "RETRY_NOT_REQUESTED",
          };

      const job = await CreativeDirectorJobRuntime.advance({
        job_id: body.job_id,
        organization_id: organizationId,
        retry_failed: retryRequested,
      });

      return NextResponse.json({
        success: true,
        plan_only: true,
        production_dispatched: false,
        image_generation_started: false,
        video_generation_started: false,
        temporal_recovery: {
          reference: referenceRecovery,
          keyframe_states:
            keyframeStateRecovery,
        },
        job,
      });
    }

    if (action !== "create") {
      return NextResponse.json({
        success: false,
        error: "Unsupported action",
        supported_actions: ["create", "advance"],
      }, { status: 400 });
    }

    const projectId =
      body.creative_project_id ||
      body.project_id ||
      null;
    if (!projectId) {
      return NextResponse.json({
        success: false,
        error: "creative_project_id required",
      }, { status: 400 });
    }

    const project = await CreativeProjectRuntime.get(projectId);
    if (project.organization_id !== organizationId) {
      return NextResponse.json({
        success: false,
        error: "CREATIVE_PROJECT_NOT_IN_ORGANIZATION",
      }, { status: 404 });
    }

    const missionId =
      body.creative_mission_id ||
      body.mission_id ||
      project.creative_mission_id ||
      null;
    if (!missionId) {
      return NextResponse.json({
        success: false,
        error: "creative_mission_id required",
      }, { status: 400 });
    }

    const mission = await CreativeMissionRuntime.get(missionId);
    if (mission.organization_id !== organizationId) {
      return NextResponse.json({
        success: false,
        error: "CREATIVE_MISSION_NOT_IN_ORGANIZATION",
      }, { status: 404 });
    }

    const assetResolution = await resolvePlanningAssets({
      organizationId,
      missionId,
      projectId,
    });
    const brief = projectBrief(project, mission, body);
    const requestedOutputs = [
      {
        id: project.id,
        title: project.name,
        medium:
          project.metadata?.creative_medium ||
          project.production_type,
        formats: project.metadata?.formats || [],
        channels: project.target_channels || [],
      },
    ];

    const job = await CreativeDirectorJobRuntime.create({
      organization_id: organizationId,
      creative_mission_id: missionId,
      creative_project_id: projectId,
      assets: assetResolution.assets,
      input_snapshot: {
        organization: body.organization || {},
        brand: body.brand || {},
        industry: body.industry || null,
        objective: brief.objective,
        business_goal: brief.business_goal,
        brief,
        target_duration_seconds: brief.duration_seconds,
        fps: Number(body.fps || project.metadata?.fps || 30),
        requested_outputs: requestedOutputs,
        platform:
          (project.target_channels || []).join(", ") ||
          "multi-channel",
        budget_mode:
          project.budget_profile ||
          "quality-first",
      },
    });

    return NextResponse.json({
      success: true,
      plan_only: true,
      production_dispatched: false,
      image_generation_started: false,
      video_generation_started: false,
      asset_count: assetResolution.assets.length,
      asset_resolution: assetResolution,
      job,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code || null,
      details: error.details || null,
    }, { status: errorStatus(error) });
  }
}
