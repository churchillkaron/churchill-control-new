export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  CreativeDirectorJobRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorJobRuntime";

import {
  reason,
} from "@/lib/creative/reasoning/CreativeReasoningService";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

const JOBS = "creative_director_jobs";
const TEMPORAL_STEP = "temporal_shot_direction";
const MAX_RECOVERY_CYCLES = 24;
const RECOVERABLE_TEMPORAL_ERRORS = new Set([
  "CREATIVE_TEMPORAL_DEPARTMENT_REJECTED",
  "CREATIVE_TEMPORAL_GOVERNANCE_REJECTED",
]);

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

function meaningful(value) {
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
      "id,organization_id,creative_project_id,creative_mission_id,current_plan,input_snapshot,asset_snapshot,pipeline_result",
    )
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  return data;
}

async function persistPipeline({
  jobId,
  organizationId,
  pipelineResult,
}) {
  const updatedAt = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from(JOBS)
    .update({
      pipeline_result: pipelineResult,
      updated_at: updatedAt,
    })
    .eq("id", jobId)
    .eq("organization_id", organizationId);

  if (error) throw error;
  return updatedAt;
}

function resultObjects(value) {
  const output = [];
  const queue = [value];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();

    if (!current || typeof current !== "object") {
      continue;
    }

    if (seen.has(current)) continue;
    seen.add(current);

    if (!Array.isArray(current)) {
      output.push(current);
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    for (const key of [
      "result",
      "output",
      "data",
      "governance",
      "temporal_governance",
      "temporal_contract",
    ]) {
      if (current[key]) {
        queue.push(current[key]);
      }
    }
  }

  return output;
}

async function recoverKeyframeStates({
  jobId,
  organizationId,
  hydrated,
}) {
  const failure = temporalFailure(hydrated);
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
        !meaningful(track.initial_state) ||
        !meaningful(track.final_state)
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
            meaningful(track.initial_state),
          final_state_present:
            meaningful(track.final_state),
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

        if (meaningful(keyframe.state)) {
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

  const recoveredAt = await persistPipeline({
    jobId,
    organizationId,
    pipelineResult: {
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
          recovered_at:
            new Date().toISOString(),
        },
        activity_updated_at:
          new Date().toISOString(),
      },
    },
  });

  return {
    applied: true,
    recoverable: true,
    kind:
      "DETERMINISTIC_KEYFRAME_STATE_RECOVERY",
    scene_number: sceneNumber,
    shot_number: shotNumber,
    department,
    recovered_count: recoveredCount,
    recovered_addresses:
      recoveredAddresses,
    recovered_at: recoveredAt,
  };
}

function governanceRequirements(failures = []) {
  const values = list(failures).map(String);
  const known = [
    "temporal entering continuity missing",
    "temporal leaving continuity missing",
    "temporal continuity locks missing",
    "global temporal immutable locks missing",
    "directed evolution rules missing",
    "temporal quality requirements missing",
  ];

  const unknown = values.filter((failure) =>
    !known.some((suffix) =>
      failure.endsWith(suffix),
    ),
  );

  return {
    unknown,
    entering_state: values.some((failure) =>
      failure.endsWith(
        "temporal entering continuity missing",
      ),
    ),
    leaving_state: values.some((failure) =>
      failure.endsWith(
        "temporal leaving continuity missing",
      ),
    ),
    continuity_locks: values.some((failure) =>
      failure.endsWith(
        "temporal continuity locks missing",
      ),
    ),
    immutable_locks: values.some((failure) =>
      failure.endsWith(
        "global temporal immutable locks missing",
      ),
    ),
    directed_evolution: values.some((failure) =>
      failure.endsWith(
        "directed evolution rules missing",
      ),
    ),
    quality_requirements: values.some((failure) =>
      failure.endsWith(
        "temporal quality requirements missing",
      ),
    ),
  };
}

function governanceOutputShape() {
  return {
    result: {
      continuity: {
        entering_state: {},
        leaving_state: {},
        locks: [],
        handoff_requirements: [],
      },
      immutable_locks: [],
      directed_evolution: [],
      quality_requirements: {},
      decisions: [],
      risks: [],
    },
  };
}

function governanceResult({
  execution,
  requirements,
}) {
  if (
    execution.fallback ||
    execution.recovery
  ) {
    const error = new Error(
      "CREATIVE_TEMPORAL_FOCUSED_GOVERNANCE_REASONING_FAILED",
    );
    error.code =
      "CREATIVE_TEMPORAL_FOCUSED_GOVERNANCE_REASONING_FAILED";
    error.details = {
      fallback_reason:
        execution.fallback_reason || null,
    };
    throw error;
  }

  const candidates = resultObjects(
    execution.result,
  );

  const source = candidates.find((candidate) =>
    candidate.continuity ||
    candidate.immutable_locks ||
    candidate.directed_evolution ||
    candidate.quality_requirements,
  ) || {};

  const continuity = object(source.continuity);
  const result = {
    continuity,
    immutable_locks:
      list(source.immutable_locks),
    directed_evolution:
      list(source.directed_evolution),
    quality_requirements:
      object(source.quality_requirements),
  };

  const missing = [];

  if (
    requirements.entering_state &&
    !meaningful(continuity.entering_state)
  ) {
    missing.push("continuity.entering_state");
  }
  if (
    requirements.leaving_state &&
    !meaningful(continuity.leaving_state)
  ) {
    missing.push("continuity.leaving_state");
  }
  if (
    requirements.continuity_locks &&
    !list(continuity.locks).length
  ) {
    missing.push("continuity.locks");
  }
  if (
    requirements.immutable_locks &&
    !result.immutable_locks.length
  ) {
    missing.push("immutable_locks");
  }
  if (
    requirements.directed_evolution &&
    !result.directed_evolution.length
  ) {
    missing.push("directed_evolution");
  }
  if (
    requirements.quality_requirements &&
    !Object.keys(
      result.quality_requirements,
    ).length
  ) {
    missing.push("quality_requirements");
  }

  if (missing.length) {
    const error = new Error(
      "CREATIVE_TEMPORAL_FOCUSED_GOVERNANCE_INCOMPLETE",
    );
    error.code =
      "CREATIVE_TEMPORAL_FOCUSED_GOVERNANCE_INCOMPLETE";
    error.details = {
      missing,
      response_keys:
        candidates.map((candidate) =>
          Object.keys(candidate),
        ),
    };
    throw error;
  }

  return result;
}

async function recoverGovernance({
  jobId,
  organizationId,
  hydrated,
}) {
  const failure = temporalFailure(hydrated);
  const details = object(failure.details);
  const failures = list(details.failures);
  const requirements = governanceRequirements(
    failures,
  );

  if (
    !failures.length ||
    requirements.unknown.length
  ) {
    return {
      applied: false,
      recoverable: false,
      code: failure.code,
      reason:
        "GOVERNANCE_FAILURE_CONTAINS_UNKNOWN_REQUIREMENTS",
      failures,
      unknown_failures:
        requirements.unknown,
    };
  }

  const sceneNumber = Number(details.scene_number);
  const shotNumber = Number(details.shot_number);
  const row = await getJobRow({
    jobId,
    organizationId,
  });

  const pipeline = object(row.pipeline_result);
  const temporal = object(
    pipeline.temporal_direction,
  );

  const partial = list(
    temporal.partial_shots,
  ).find((value) =>
    Number(value?.scene_number) === sceneNumber &&
    Number(value?.shot_number) === shotNumber,
  );

  if (!partial) {
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

  const plan = object(row.current_plan);
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
  const scenes = list(plan.scenes);
  const sceneIndex = scenes.indexOf(scene);
  const shots = list(object(scene).shots);
  const shotIndex = shots.indexOf(shot);
  const previousShot =
    shotIndex > 0
      ? shots[shotIndex - 1]
      : sceneIndex > 0
        ? list(
            object(
              scenes[sceneIndex - 1],
            ).shots,
          ).at(-1) || null
        : null;
  const nextShot =
    shotIndex >= 0 &&
    shotIndex < shots.length - 1
      ? shots[shotIndex + 1]
      : sceneIndex >= 0 &&
        sceneIndex < scenes.length - 1
        ? list(
            object(
              scenes[sceneIndex + 1],
            ).shots,
          )[0] || null
        : null;

  const existingContract = object(
    partial.temporal_contract,
  );
  const input = object(row.input_snapshot);

  const execution = await reason({
    task: [
      `Complete only the missing temporal governance fields for scene ${sceneNumber} shot ${shotNumber}.`,
      "The master still, all department tracks, every keyframe, all timing, identities, references, physical rules, motivations and acceptance criteria are locked and must not be rewritten.",
      "Return only exact shot-level governance: entering state, leaving state, continuity locks, handoff requirements, global immutable locks, directed evolution and measurable temporal quality requirements.",
      "Global immutable locks must identify the cross-department properties that may never drift during this shot.",
      "Directed evolution must state the causal, chronological progression from the locked opening state to the locked leaving state without inventing new action.",
      "Ground continuity in the neighboring shots and the current locked department contracts.",
      "Address every supplied failure explicitly. Do not return empty placeholders or generic cinematic language.",
    ].join(" "),
    input: {
      organization_id: organizationId,
      creative_project_id:
        row.creative_project_id,
      creative_mission_id:
        row.creative_mission_id,
      objective: input.objective,
      brief: input.brief,
      scene_number: sceneNumber,
      shot_number: shotNumber,
      current_scene: scene,
      current_shot: shot,
      previous_shot: previousShot,
      next_shot: nextShot,
      locked_master_still:
        object(
          partial.master_still_contract,
        ),
      locked_temporal_contract:
        existingContract,
      canonical_assets:
        list(row.asset_snapshot),
      exact_missing_failures:
        failures,
      required_fields:
        requirements,
    },
    constraints: {
      exactly_one_shot: true,
      only_missing_governance_fields: true,
      preserve_master_still: true,
      preserve_all_departments: true,
      preserve_all_keyframes: true,
      preserve_all_timing: true,
      preserve_all_states: true,
      preserve_all_references: true,
      immutable_locks_required:
        requirements.immutable_locks,
      directed_evolution_required:
        requirements.directed_evolution,
      measurable_quality_required:
        requirements.quality_requirements,
      no_generic_filler: true,
    },
    outputShape:
      governanceOutputShape(),
    temperature: 0.2,
    maxOutputTokens: 5000,
    timeoutMs: 240000,
    metadata: {
      creative_director_job_id: jobId,
      creative_director_step_key:
        TEMPORAL_STEP,
      temporal_scene_number:
        sceneNumber,
      temporal_shot_number:
        shotNumber,
      temporal_stage:
        "FOCUSED_GOVERNANCE_RECOVERY",
    },
  });

  const governance = governanceResult({
    execution,
    requirements,
  });

  const currentContinuity = object(
    existingContract.continuity,
  );
  const mergedContinuity = {
    ...currentContinuity,
    ...governance.continuity,
    locks:
      list(governance.continuity.locks).length
        ? list(governance.continuity.locks)
        : list(currentContinuity.locks),
    handoff_requirements:
      list(
        governance.continuity
          .handoff_requirements,
      ).length
        ? list(
            governance.continuity
              .handoff_requirements,
          )
        : list(
            currentContinuity
              .handoff_requirements,
          ),
  };

  const mergedContract = {
    ...existingContract,
    continuity: mergedContinuity,
    immutable_locks:
      governance.immutable_locks.length
        ? governance.immutable_locks
        : list(
            existingContract.immutable_locks,
          ),
    directed_evolution:
      governance.directed_evolution.length
        ? governance.directed_evolution
        : list(
            existingContract.directed_evolution,
          ),
    quality_requirements:
      Object.keys(
        governance.quality_requirements,
      ).length
        ? governance.quality_requirements
        : object(
            existingContract
              .quality_requirements,
          ),
  };

  const completedAt =
    new Date().toISOString();
  const executionSummary = {
    phase:
      "FOCUSED_GOVERNANCE_RECOVERY",
    provider: execution.provider || null,
    model: execution.model || null,
    confidence:
      Number(execution.confidence || 0),
    repaired_failures: failures,
    completed_at: completedAt,
  };

  const partialShots = list(
    temporal.partial_shots,
  ).map((value) => {
    if (
      Number(value?.scene_number) !== sceneNumber ||
      Number(value?.shot_number) !== shotNumber
    ) {
      return value;
    }

    return {
      ...value,
      temporal_contract:
        mergedContract,
      governance_completed: false,
      executions: [
        ...list(value.executions),
        executionSummary,
      ].slice(-30),
      focused_governance_recovery: {
        failures,
        repaired_fields: {
          entering_state:
            requirements.entering_state,
          leaving_state:
            requirements.leaving_state,
          continuity_locks:
            requirements.continuity_locks,
          immutable_locks:
            requirements.immutable_locks,
          directed_evolution:
            requirements.directed_evolution,
          quality_requirements:
            requirements.quality_requirements,
        },
        provider:
          execution.provider || null,
        model: execution.model || null,
        confidence:
          Number(execution.confidence || 0),
        completed_at: completedAt,
      },
      updated_at: completedAt,
    };
  });

  const recoveredAt = await persistPipeline({
    jobId,
    organizationId,
    pipelineResult: {
      ...pipeline,
      temporal_direction: {
        ...temporal,
        partial_shots: partialShots,
        active_address:
          `${sceneNumber}:${shotNumber}`,
        active_scene_number: sceneNumber,
        active_shot_number: shotNumber,
        active_phase:
          "FOCUSED_GOVERNANCE_RECOVERED",
        focused_governance_recovery: {
          scene_number: sceneNumber,
          shot_number: shotNumber,
          failures,
          provider:
            execution.provider || null,
          model: execution.model || null,
          confidence:
            Number(execution.confidence || 0),
          recovered_at: completedAt,
        },
        activity_updated_at: completedAt,
      },
    },
  });

  return {
    applied: true,
    recoverable: true,
    kind:
      "FOCUSED_GOVERNANCE_REASONING_RECOVERY",
    scene_number: sceneNumber,
    shot_number: shotNumber,
    failures,
    provider: execution.provider || null,
    model: execution.model || null,
    confidence:
      Number(execution.confidence || 0),
    recovered_at: recoveredAt,
  };
}

async function recoverCurrentFailure({
  jobId,
  organizationId,
  hydrated,
}) {
  const failure = temporalFailure(hydrated);

  if (
    failure.code ===
    "CREATIVE_TEMPORAL_DEPARTMENT_REJECTED"
  ) {
    return recoverKeyframeStates({
      jobId,
      organizationId,
      hydrated,
    });
  }

  if (
    failure.code ===
    "CREATIVE_TEMPORAL_GOVERNANCE_REJECTED"
  ) {
    return recoverGovernance({
      jobId,
      organizationId,
      hydrated,
    });
  }

  return {
    applied: false,
    recoverable: false,
    code: failure.code || null,
    reason:
      "CURRENT_FAILURE_REQUIRES_UNSUPPORTED_RECOVERY",
    details: failure.details || null,
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
        hydrated: before,
      });

      if (!recovery.applied) {
        return NextResponse.json({
          success: false,
          plan_only: true,
          production_dispatched: false,
          image_generation_started: false,
          video_generation_started: false,
          error:
            "CREATIVE_TEMPORAL_RECOVERY_REQUIRES_REVIEW",
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
          RECOVERABLE_TEMPORAL_ERRORS.has(code)
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
