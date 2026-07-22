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
const MAX_ORCHESTRATION_CYCLES = 16;

const DELEGATED_FAILURES = new Set([
  "CREATIVE_TEMPORAL_DEPARTMENT_REJECTED",
  "CREATIVE_TEMPORAL_GOVERNANCE_REJECTED",
]);

const REFERENCE_FAILURE =
  "CREATIVE_TEMPORAL_MASTER_STILL_REFERENCE_SET_INVALID";

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
  const masterStill = object(
    source.master_still_contract,
  );

  return unique([
    ...referenceIdentifiers(
      source.reference_asset_ids,
    ),
    ...referenceIdentifiers(source.assets),
    ...referenceIdentifiers(
      masterStill.reference_asset_ids,
    ),
    ...nestedReferenceIdentifiers(
      source.actors,
    ),
    ...nestedReferenceIdentifiers(
      source.subjects,
    ),
    ...nestedReferenceIdentifiers(
      source.objects_products,
    ),
    ...nestedReferenceIdentifiers(
      source.objects,
    ),
    ...nestedReferenceIdentifiers(
      source.products,
    ),
  ]);
}

function sameIdentifierSet(left = [], right = []) {
  const leftSet = new Set(unique(left));
  const rightSet = new Set(unique(right));

  if (leftSet.size !== rightSet.size) {
    return false;
  }

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

function temporalStep(job = {}) {
  return list(job.steps).find(
    (step) =>
      step?.step_key === TEMPORAL_STEP,
  ) || null;
}

function temporalFailure(job = {}) {
  const step = temporalStep(job);

  return object(
    step?.error ||
    job.error,
  );
}

async function getJob({
  jobId,
  organizationId,
  includePlan = false,
}) {
  return CreativeDirectorJobRuntime.get({
    job_id: jobId,
    organization_id: organizationId,
    include_plan: includePlan,
  });
}

async function getJobRow({
  jobId,
  organizationId,
}) {
  const { data, error } = await supabaseAdmin
    .from(JOBS)
    .select(
      "id,organization_id,current_plan,asset_snapshot,pipeline_result",
    )
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  return data;
}

async function recoverReferenceFailure({
  jobId,
  organizationId,
  hydrated,
}) {
  const failure = temporalFailure(hydrated);

  if (failure.code !== REFERENCE_FAILURE) {
    return {
      applied: false,
      reason:
        "CURRENT_FAILURE_IS_NOT_REFERENCE_RECOVERY",
      code: failure.code || null,
    };
  }

  const details = object(failure.details);
  const expected = referenceIdentifiers(
    details.expected,
  );
  const received = referenceIdentifiers(
    details.received,
  );

  if (expected.length || !received.length) {
    return {
      applied: false,
      reason:
        "REFERENCE_FAILURE_REQUIRES_REVIEW",
      expected,
      received,
      details,
    };
  }

  const row = await getJobRow({
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
    return {
      applied: false,
      reason:
        "REFERENCE_NOT_IN_CANONICAL_ASSET_SNAPSHOT",
      unknown_asset_ids: unknown,
      canonical_asset_ids: [...available],
    };
  }

  const sceneNumber = Number(
    details.scene_number,
  );
  const shotNumber = Number(
    details.shot_number,
  );

  const plan = clone(
    object(row.current_plan),
  );

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
    return {
      applied: false,
      reason: "REFERENCE_SHOT_NOT_FOUND",
      scene_number: sceneNumber,
      shot_number: shotNumber,
    };
  }

  const assigned = assignedShotReferenceIds(
    shot,
  );

  if (
    assigned.length &&
    !sameIdentifierSet(
      assigned,
      received,
    )
  ) {
    return {
      applied: false,
      reason:
        "ASSIGNED_REFERENCE_SET_CONFLICT",
      scene_number: sceneNumber,
      shot_number: shotNumber,
      assigned,
      received,
    };
  }

  shot.reference_asset_ids = received;
  shot.assets = received;

  const pipeline = object(
    row.pipeline_result,
  );
  const temporal = object(
    pipeline.temporal_direction,
  );
  const recoveredAt =
    new Date().toISOString();

  const partialShots = list(
    temporal.partial_shots,
  ).map((partialValue) => {
    const partial = object(partialValue);

    if (
      Number(partial.scene_number) !==
        sceneNumber ||
      Number(partial.shot_number) !==
        shotNumber
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
      reference_recovery: {
        source:
          "CANONICAL_ASSET_SNAPSHOT",
        reference_asset_ids: received,
        recovered_at: recoveredAt,
      },
      updated_at: recoveredAt,
    };
  });

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

  const { error: updateError } =
    await supabaseAdmin
      .from(JOBS)
      .update({
        current_plan: plan,
        pipeline_result: nextPipeline,
        updated_at: recoveredAt,
      })
      .eq("id", jobId)
      .eq(
        "organization_id",
        organizationId,
      );

  if (updateError) throw updateError;

  return {
    applied: true,
    kind:
      "CANONICAL_REFERENCE_MATERIALIZATION",
    scene_number: sceneNumber,
    shot_number: shotNumber,
    reference_asset_ids: received,
    validation: {
      expected_set_was_empty: true,
      canonical_asset_snapshot_checked: true,
      assigned_reference_conflict_checked: true,
      production_bible_materialized: true,
      partial_checkpoint_materialized: true,
    },
    recovered_at: recoveredAt,
  };
}

function forwardedHeaders(req) {
  const headers = {
    "Content-Type": "application/json",
  };

  const cookie = req.headers.get("cookie");
  const authorization =
    req.headers.get("authorization");

  if (cookie) headers.Cookie = cookie;
  if (authorization) {
    headers.Authorization = authorization;
  }

  return headers;
}

async function delegateTemporalRecovery({
  req,
  jobId,
  organizationId,
}) {
  const url = new URL(
    "/api/creative/director-jobs/recover-temporal",
    req.url,
  );

  const response = await fetch(url, {
    method: "POST",
    headers: forwardedHeaders(req),
    body: JSON.stringify({
      organization_id: organizationId,
      job_id: jobId,
    }),
    cache: "no-store",
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = {
      success: false,
      error:
        "TEMPORAL_DELEGATE_RESPONSE_INVALID",
    };
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function safeResponse({
  success,
  status = 200,
  error = null,
  details = null,
  temporalCompleted = false,
  recoveries = [],
  delegates = [],
  job = null,
}) {
  return NextResponse.json({
    success,
    plan_only: true,
    production_dispatched: false,
    image_generation_started: false,
    video_generation_started: false,
    temporal_completed:
      temporalCompleted,
    error,
    details,
    reference_recoveries: recoveries,
    delegated_recoveries: delegates,
    job,
  }, { status });
}

function responseStatus(error = {}) {
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
      return safeResponse({
        success: false,
        status: 400,
        error: "job_id required",
      });
    }

    const referenceRecoveries = [];
    const delegatedRecoveries = [];

    for (
      let cycle = 1;
      cycle <= MAX_ORCHESTRATION_CYCLES;
      cycle += 1
    ) {
      const current = await getJob({
        jobId,
        organizationId,
        includePlan: false,
      });

      const step = temporalStep(current);

      if (step?.status === "COMPLETED") {
        return safeResponse({
          success: true,
          temporalCompleted: true,
          recoveries: referenceRecoveries,
          delegates: delegatedRecoveries,
          job: current,
        });
      }

      const failure = temporalFailure(
        current,
      );
      const code = String(
        failure.code || "",
      );

      if (code === REFERENCE_FAILURE) {
        const recovery =
          await recoverReferenceFailure({
            jobId,
            organizationId,
            hydrated: current,
          });

        if (!recovery.applied) {
          return safeResponse({
            success: false,
            status: 422,
            error:
              "CREATIVE_TEMPORAL_REFERENCE_RECOVERY_REQUIRES_REVIEW",
            details: recovery,
            recoveries: referenceRecoveries,
            delegates: delegatedRecoveries,
            job: current,
          });
        }

        referenceRecoveries.push({
          cycle,
          ...recovery,
        });

        try {
          const advanced =
            await CreativeDirectorJobRuntime.advance({
              job_id: jobId,
              organization_id:
                organizationId,
              retry_failed: true,
            });

          if (
            temporalStep(advanced)?.status ===
            "COMPLETED"
          ) {
            return safeResponse({
              success: true,
              temporalCompleted: true,
              recoveries:
                referenceRecoveries,
              delegates:
                delegatedRecoveries,
              job: advanced,
            });
          }
        } catch (error) {
          const nextCode = String(
            error.code ||
            error.message ||
            "",
          );

          if (
            nextCode === REFERENCE_FAILURE ||
            DELEGATED_FAILURES.has(nextCode)
          ) {
            continue;
          }

          throw error;
        }

        continue;
      }

      if (DELEGATED_FAILURES.has(code)) {
        const delegated =
          await delegateTemporalRecovery({
            req,
            jobId,
            organizationId,
          });

        delegatedRecoveries.push({
          cycle,
          http_status: delegated.status,
          success:
            delegated.payload?.success ===
            true,
          temporal_completed:
            delegated.payload
              ?.temporal_completed === true,
          recovery_cycles:
            delegated.payload
              ?.recovery_cycles || [],
          error:
            delegated.payload?.error ||
            null,
          code:
            delegated.payload?.code ||
            null,
          details:
            delegated.payload?.details ||
            null,
        });

        const after = await getJob({
          jobId,
          organizationId,
          includePlan: false,
        });

        if (
          temporalStep(after)?.status ===
          "COMPLETED"
        ) {
          return safeResponse({
            success: true,
            temporalCompleted: true,
            recoveries:
              referenceRecoveries,
            delegates:
              delegatedRecoveries,
            job: after,
          });
        }

        const afterCode = String(
          temporalFailure(after).code ||
          "",
        );

        if (
          afterCode === REFERENCE_FAILURE ||
          DELEGATED_FAILURES.has(
            afterCode,
          )
        ) {
          continue;
        }

        return safeResponse({
          success: false,
          status:
            delegated.status || 422,
          error:
            "CREATIVE_TEMPORAL_CONVERGENCE_REQUIRES_REVIEW",
          details: {
            current_failure:
              temporalFailure(after),
            delegated_response:
              delegated.payload,
          },
          recoveries:
            referenceRecoveries,
          delegates:
            delegatedRecoveries,
          job: after,
        });
      }

      return safeResponse({
        success: false,
        status: 422,
        error:
          "CREATIVE_TEMPORAL_CONVERGENCE_UNSUPPORTED_FAILURE",
        details: failure,
        recoveries: referenceRecoveries,
        delegates: delegatedRecoveries,
        job: current,
      });
    }

    const finalJob = await getJob({
      jobId,
      organizationId,
      includePlan: false,
    });

    return safeResponse({
      success: false,
      status: 422,
      error:
        "CREATIVE_TEMPORAL_CONVERGENCE_CYCLE_LIMIT_REACHED",
      details: {
        cycle_limit:
          MAX_ORCHESTRATION_CYCLES,
        current_failure:
          temporalFailure(finalJob),
      },
      recoveries: referenceRecoveries,
      delegates: delegatedRecoveries,
      job: finalJob,
    });
  } catch (error) {
    return safeResponse({
      success: false,
      status: responseStatus(error),
      error:
        error.message ||
        "CREATIVE_TEMPORAL_CONVERGENCE_FAILED",
      details: error.details || null,
    });
  }
}
