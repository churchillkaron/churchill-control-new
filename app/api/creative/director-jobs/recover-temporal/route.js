export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  CreativeDirectorJobRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorJobRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

const JOBS = "creative_director_jobs";
const TEMPORAL_STEP = "temporal_shot_direction";
const MAX_RECOVERY_CYCLES = 16;

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

function temporalStep(job = {}) {
  return list(job.steps).find(
    (step) => step?.step_key === TEMPORAL_STEP,
  ) || null;
}

function temporalFailure(job = {}) {
  const step = temporalStep(job);

  return object(
    step?.error ||
    job.error,
  );
}

function failureAddress(value) {
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

function deterministicState({
  track,
  keyframe,
  durationMs,
}) {
  const atMs = Number(keyframe.at_ms);
  const progress = Math.max(
    0,
    Math.min(
      1,
      durationMs > 0
        ? atMs / durationMs
        : 0,
    ),
  );

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
    progress:
      Math.round(progress * 1000000) /
      1000000,
    interpolation:
      keyframe.interpolation ||
      track.interpolation ||
      "linear",
  };
}

async function getJobRow({
  jobId,
  organizationId,
}) {
  const { data, error } = await supabaseAdmin
    .from(JOBS)
    .select(
      "id,organization_id,pipeline_result",
    )
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  return data;
}

async function recoverCurrentFailure({
  jobId,
  organizationId,
}) {
  const hydrated = await CreativeDirectorJobRuntime.get({
    job_id: jobId,
    organization_id: organizationId,
    include_plan: false,
  });

  const failure = temporalFailure(hydrated);

  if (
    failure.code !==
    "CREATIVE_TEMPORAL_DEPARTMENT_REJECTED"
  ) {
    return {
      applied: false,
      recoverable: false,
      code: failure.code || null,
      reason:
        "CURRENT_FAILURE_IS_NOT_DETERMINISTIC_KEYFRAME_STATE_RECOVERY",
    };
  }

  const details = object(failure.details);
  const addresses = list(details.failures)
    .map(failureAddress);

  if (
    !addresses.length ||
    addresses.some((address) => !address)
  ) {
    return {
      applied: false,
      recoverable: false,
      code: failure.code,
      reason:
        "DEPARTMENT_FAILURE_CONTAINS_NON_DETERMINISTIC_REQUIREMENTS",
      failures: list(details.failures),
    };
  }

  const sceneNumber = Number(details.scene_number);
  const shotNumber = Number(details.shot_number);
  const department = String(
    details.department || "",
  ).toLowerCase();

  const mismatch = addresses.some((address) =>
    address.scene_number !== sceneNumber ||
    address.shot_number !== shotNumber ||
    address.department !== department,
  );

  if (mismatch) {
    return {
      applied: false,
      recoverable: false,
      code: failure.code,
      reason:
        "FAILURE_ADDRESS_DOES_NOT_MATCH_DEPARTMENT_CONTEXT",
      addresses,
    };
  }

  const row = await getJobRow({
    jobId,
    organizationId,
  });

  const pipeline = object(row.pipeline_result);
  const temporal = object(
    pipeline.temporal_direction,
  );

  let foundPartial = false;
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

    foundPartial = true;

    const temporalContract = clone(
      object(partial.temporal_contract),
    );

    const departmentContract = object(
      temporalContract[department],
    );

    const durationMs = Number(
      temporalContract.duration_ms ||
      0,
    );

    if (
      !Number.isFinite(durationMs) ||
      durationMs <= 0
    ) {
      const error = new Error(
        "CREATIVE_TEMPORAL_RECOVERY_DURATION_REQUIRED",
      );
      error.code =
        "CREATIVE_TEMPORAL_RECOVERY_DURATION_REQUIRED";
      error.details = {
        scene_number: sceneNumber,
        shot_number: shotNumber,
        department,
        duration_ms: durationMs,
      };
      throw error;
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

      if (!requiredTimes.size) {
        return trackValue;
      }

      if (
        !meaningfulState(track.initial_state) ||
        !meaningfulState(track.final_state)
      ) {
        const error = new Error(
          "CREATIVE_TEMPORAL_RECOVERY_ENDPOINTS_REQUIRED",
        );
        error.code =
          "CREATIVE_TEMPORAL_RECOVERY_ENDPOINTS_REQUIRED";
        error.details = {
          scene_number: sceneNumber,
          shot_number: shotNumber,
          department,
          track_number: trackNumber,
          initial_state_present:
            meaningfulState(track.initial_state),
          final_state_present:
            meaningfulState(track.final_state),
        };
        throw error;
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
          const error = new Error(
            "CREATIVE_TEMPORAL_RECOVERY_INTERMEDIATE_ONLY",
          );
          error.code =
            "CREATIVE_TEMPORAL_RECOVERY_INTERMEDIATE_ONLY";
          error.details = {
            scene_number: sceneNumber,
            shot_number: shotNumber,
            department,
            track_number: trackNumber,
            at_ms: atMs,
            duration_ms: durationMs,
          };
          throw error;
        }

        if (meaningfulState(keyframe.state)) {
          requiredTimes.delete(atMs);
          return keyframeValue;
        }

        const state = deterministicState({
          track,
          keyframe,
          durationMs,
        });

        requiredTimes.delete(atMs);
        recoveredCount += 1;
        recoveredAddresses.push({
          scene_number: sceneNumber,
          shot_number: shotNumber,
          department,
          track_number: trackNumber,
          at_ms: atMs,
          progress: state.progress,
        });

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
        const error = new Error(
          "CREATIVE_TEMPORAL_RECOVERY_ADDRESS_NOT_FOUND",
        );
        error.code =
          "CREATIVE_TEMPORAL_RECOVERY_ADDRESS_NOT_FOUND";
        error.details = {
          scene_number: sceneNumber,
          shot_number: shotNumber,
          department,
          track_number: trackNumber,
          missing_at_ms: [...requiredTimes],
        };
        throw error;
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
      deterministic_state_recovery: {
        department,
        recovered_count: recoveredCount,
        recovered_addresses:
          recoveredAddresses,
        method:
          "LOCKED_ENDPOINT_INTERPOLATION",
        recovered_at:
          new Date().toISOString(),
      },
      updated_at:
        new Date().toISOString(),
    };
  });

  if (!foundPartial) {
    return {
      applied: false,
      recoverable: false,
      code: failure.code,
      reason:
        "DURABLE_PARTIAL_SHOT_NOT_FOUND",
      scene_number: sceneNumber,
      shot_number: shotNumber,
    };
  }

  if (recoveredCount !== addresses.length) {
    return {
      applied: false,
      recoverable: false,
      code: failure.code,
      reason:
        "RECOVERED_KEYFRAME_COUNT_MISMATCH",
      expected_count: addresses.length,
      recovered_count: recoveredCount,
      recovered_addresses:
        recoveredAddresses,
    };
  }

  const recoveredAt = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from(JOBS)
    .update({
      pipeline_result: {
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
          deterministic_state_recovery: {
            scene_number: sceneNumber,
            shot_number: shotNumber,
            department,
            recovered_count: recoveredCount,
            recovered_addresses:
              recoveredAddresses,
            method:
              "LOCKED_ENDPOINT_INTERPOLATION",
            recovered_at: recoveredAt,
          },
          activity_updated_at: recoveredAt,
        },
      },
      updated_at: recoveredAt,
    })
    .eq("id", jobId)
    .eq("organization_id", organizationId);

  if (updateError) throw updateError;

  return {
    applied: true,
    recoverable: true,
    scene_number: sceneNumber,
    shot_number: shotNumber,
    department,
    recovered_count: recoveredCount,
    recovered_addresses:
      recoveredAddresses,
  };
}

function responseStatus(error = {}) {
  const code = String(
    error.code ||
    error.message ||
    "",
  ).toUpperCase();

  if (code.includes("NOT_IN_ORGANIZATION")) {
    return 404;
  }

  if (
    code.includes("REQUIRED") ||
    code.includes("INVALID")
  ) {
    return 400;
  }

  if (
    code.includes("REJECTED") ||
    code.includes("RECOVERY")
  ) {
    return 422;
  }

  return 500;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const organizationId =
      body.organization_id ||
      body.organizationId ||
      null;
    const jobId =
      body.job_id ||
      body.jobId ||
      null;

    const access = await requireOrganizationAccess({
      organizationId,
    });

    if (!access.success) {
      return NextResponse.json(
        access,
        { status: access.status },
      );
    }

    if (!jobId) {
      return NextResponse.json({
        success: false,
        error: "job_id required",
      }, { status: 400 });
    }

    const recoveries = [];
    let finalJob = null;

    for (
      let cycle = 1;
      cycle <= MAX_RECOVERY_CYCLES;
      cycle += 1
    ) {
      const before = await CreativeDirectorJobRuntime.get({
        job_id: jobId,
        organization_id: organizationId,
        include_plan: false,
      });

      const beforeStep = temporalStep(before);

      if (beforeStep?.status === "COMPLETED") {
        finalJob = before;
        break;
      }

      const recovery = await recoverCurrentFailure({
        jobId,
        organizationId,
      });

      if (!recovery.applied) {
        return NextResponse.json({
          success: false,
          plan_only: true,
          production_dispatched: false,
          image_generation_started: false,
          video_generation_started: false,
          error:
            "CREATIVE_TEMPORAL_RECOVERY_REQUIRES_REASONING",
          details: recovery,
          recovery_cycles: recoveries,
          job: before,
        }, { status: 422 });
      }

      recoveries.push({
        cycle,
        ...recovery,
      });

      try {
        finalJob = await CreativeDirectorJobRuntime.advance({
          job_id: jobId,
          organization_id: organizationId,
          retry_failed: true,
        });
      } catch (error) {
        const code = String(
          error.code ||
          error.message ||
          "",
        );

        if (
          code ===
          "CREATIVE_TEMPORAL_DEPARTMENT_REJECTED"
        ) {
          continue;
        }

        throw error;
      }

      const afterStep = temporalStep(finalJob);

      if (afterStep?.status === "COMPLETED") {
        break;
      }
    }

    const resolved = finalJob ||
      await CreativeDirectorJobRuntime.get({
        job_id: jobId,
        organization_id: organizationId,
        include_plan: false,
      });

    const resolvedStep = temporalStep(resolved);

    if (resolvedStep?.status !== "COMPLETED") {
      return NextResponse.json({
        success: false,
        plan_only: true,
        production_dispatched: false,
        image_generation_started: false,
        video_generation_started: false,
        error:
          "CREATIVE_TEMPORAL_RECOVERY_CYCLE_LIMIT_REACHED",
        recovery_cycle_limit:
          MAX_RECOVERY_CYCLES,
        recovery_cycles: recoveries,
        job: resolved,
      }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      plan_only: true,
      production_dispatched: false,
      image_generation_started: false,
      video_generation_started: false,
      temporal_completed: true,
      recovery_cycles: recoveries,
      job: resolved,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      plan_only: true,
      production_dispatched: false,
      image_generation_started: false,
      video_generation_started: false,
      error:
        error.message ||
        "CREATIVE_TEMPORAL_RECOVERY_FAILED",
      code: error.code || null,
      details: error.details || null,
    }, {
      status: responseStatus(error),
    });
  }
}
