export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  CreativeDirectorJobRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorJobRuntime";

import {
  inspectCreativeRepairProvenance,
} from "@/lib/creative/director/runtime/CreativeRepairProvenanceContract";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  POST as directorJobPost,
} from "../route";

import {
  POST as convergeTemporalPost,
} from "../converge-temporal/route";

import {
  POST as convergeStoryboardPost,
} from "../converge-storyboard/route";

import {
  POST as convergeAdaptiveStoryboardPost,
} from "../converge-storyboard-adaptive/route";

const JOBS = "creative_director_jobs";
const MAX_CYCLES = 40;

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

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function currentStep(job = {}) {
  if (!job.current_step_key) return null;

  return list(job.steps).find(
    (step) =>
      step?.step_key ===
      job.current_step_key,
  ) || null;
}

function stepByKey(job = {}, key) {
  return list(job.steps).find(
    (step) => step?.step_key === key,
  ) || null;
}

function headersFrom(req) {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  const cookie = req.headers.get("cookie");
  const authorization =
    req.headers.get("authorization");

  if (cookie) headers.set("cookie", cookie);
  if (authorization) {
    headers.set(
      "authorization",
      authorization,
    );
  }

  return headers;
}

function internalRequest({
  req,
  pathname,
  body,
}) {
  return new Request(
    new URL(pathname, req.url),
    {
      method: "POST",
      headers: headersFrom(req),
      body: JSON.stringify(body),
    },
  );
}

async function invoke({
  handler,
  req,
  pathname,
  body,
}) {
  const response = await handler(
    internalRequest({
      req,
      pathname,
      body,
    }),
  );

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    payload = {
      success: false,
      error:
        "CREATIVE_CANARY_V2_HANDLER_RESPONSE_INVALID",
      details: {
        message: error.message,
      },
    };
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function getJob({
  jobId,
  organizationId,
}) {
  return CreativeDirectorJobRuntime.get({
    job_id: jobId,
    organization_id: organizationId,
    include_plan: false,
  });
}

async function getPipeline({
  jobId,
  organizationId,
}) {
  const { data, error } = await supabaseAdmin
    .from(JOBS)
    .select(
      "id,organization_id,pipeline_result,current_plan,storyboard_audit,error,status,input_snapshot",
    )
    .eq("id", jobId)
    .eq(
      "organization_id",
      organizationId,
    )
    .single();

  if (error) throw error;
  return data;
}

function stateFingerprint(job = {}) {
  const step = currentStep(job);

  return JSON.stringify({
    status: job.status || null,
    current_step_key:
      job.current_step_key || null,
    current_step_index:
      job.current_step_index ?? null,
    completed_steps:
      job.completed_steps ?? null,
    progress_percent:
      job.progress_percent ?? null,
    step_status:
      step?.status || null,
    step_attempt:
      step?.attempt ?? null,
    step_error:
      step?.error || null,
    job_error: job.error || null,
  });
}

function eventRecord({
  cycle,
  kind,
  before,
  invocation,
  after,
}) {
  const beforeStep = currentStep(before);
  const afterStep = currentStep(after);
  const beforeFingerprint =
    stateFingerprint(before);
  const afterFingerprint =
    stateFingerprint(after);

  return {
    cycle,
    kind,
    durable_progress:
      beforeFingerprint !==
      afterFingerprint,
    before_fingerprint:
      beforeFingerprint,
    after_fingerprint:
      afterFingerprint,
    before: {
      job_status:
        before.status || null,
      step_key:
        before.current_step_key || null,
      step_status:
        beforeStep?.status || null,
      step_attempt:
        beforeStep?.attempt ?? null,
      error:
        beforeStep?.error ||
        before.error ||
        null,
    },
    handler: {
      http_status:
        invocation.status,
      success:
        invocation.payload?.success === true,
      error:
        invocation.payload?.error || null,
      code:
        invocation.payload?.code || null,
      details:
        invocation.payload?.details || null,
      convergence:
        invocation.payload?.convergence ||
        null,
    },
    after: {
      job_status:
        after.status || null,
      step_key:
        after.current_step_key || null,
      step_status:
        afterStep?.status || null,
      step_attempt:
        afterStep?.attempt ?? null,
      error:
        afterStep?.error ||
        after.error ||
        null,
    },
  };
}

function response({
  success,
  status = 200,
  error = null,
  details = null,
  verdict = null,
  job = null,
  events = [],
  provenance = null,
  thresholds = null,
  created = null,
}) {
  return NextResponse.json({
    success,
    plan_only: true,
    production_dispatched: false,
    image_generation_started: false,
    video_generation_started: false,
    error,
    details,
    verdict,
    thresholds,
    created,
    provenance,
    events,
    job,
  }, { status });
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

  if (
    code.includes("REJECTED") ||
    code.includes("CANARY") ||
    code.includes("UNSUPPORTED") ||
    code.includes("CONVERGENCE")
  ) {
    return 422;
  }

  return 500;
}

function releaseVerdict({
  job,
  events,
  provenance,
  thresholds,
}) {
  const temporal = stepByKey(
    job,
    "temporal_shot_direction",
  );
  const finalAudit = stepByKey(
    job,
    "final_audit",
  );
  const successfulRecoveries =
    events.filter((entry) =>
      entry.kind !== "ADVANCE" &&
      entry.handler.success === true &&
      entry.durable_progress === true,
    );
  const failedRecoveries =
    events.filter((entry) =>
      entry.kind !== "ADVANCE" &&
      entry.handler.success !== true,
    );

  const planOnlyPassed = Boolean(
    job.status === "COMPLETED" &&
    finalAudit?.status === "COMPLETED" &&
    finalAudit?.metrics?.audit?.passed ===
      true &&
    number(
      finalAudit?.metrics?.audit
        ?.failure_count,
      -1,
    ) === 0,
  );

  const temporalAttempt = number(
    temporal?.attempt,
    0,
  );
  const thresholdPassed = Boolean(
    temporalAttempt <=
      thresholds.max_temporal_attempts &&
    successfulRecoveries.length <=
      thresholds.max_recovery_handler_calls &&
    failedRecoveries.length === 0,
  );
  const releaseReady = Boolean(
    planOnlyPassed &&
    provenance.passed &&
    thresholdPassed,
  );
  const blockers = [];

  if (!planOnlyPassed) {
    blockers.push(
      "FINAL_PLAN_ONLY_AUDIT_NOT_PASSED",
    );
  }
  if (!provenance.passed) {
    blockers.push(
      "REPAIR_PROVENANCE_NOT_PASSED",
    );
  }
  if (
    temporalAttempt >
    thresholds.max_temporal_attempts
  ) {
    blockers.push(
      "TEMPORAL_ATTEMPT_THRESHOLD_EXCEEDED",
    );
  }
  if (
    successfulRecoveries.length >
    thresholds.max_recovery_handler_calls
  ) {
    blockers.push(
      "RECOVERY_HANDLER_THRESHOLD_EXCEEDED",
    );
  }
  if (failedRecoveries.length) {
    blockers.push(
      "RECOVERY_HANDLER_FAILURE_OCCURRED",
    );
  }

  return {
    plan_only_canary_passed:
      planOnlyPassed,
    release_ready: releaseReady,
    release_verdict:
      releaseReady
        ? "RELEASE_READY"
        : planOnlyPassed
          ? "PLAN_ONLY_PASSED_RELEASE_BLOCKED"
          : "PLAN_ONLY_CANARY_FAILED",
    blockers,
    final_audit_passed:
      finalAudit?.metrics?.audit?.passed ===
      true,
    final_failure_count:
      finalAudit?.metrics?.audit
        ?.failure_count ?? null,
    temporal_attempt:
      temporalAttempt,
    successful_recovery_handler_calls:
      successfulRecoveries.length,
    failed_recovery_handler_calls:
      failedRecoveries.length,
    total_orchestration_events:
      events.length,
    completed_steps:
      job.completed_steps,
    total_steps: job.total_steps,
    progress_percent:
      job.progress_percent,
  };
}

export async function POST(req) {
  const events = [];
  let created = null;
  let organizationId = null;
  let jobId = null;
  let thresholds = null;

  try {
    const body = await req.json();

    organizationId =
      body.organization_id ||
      body.organizationId ||
      null;
    const projectId =
      body.creative_project_id ||
      body.project_id ||
      null;
    const missionId =
      body.creative_mission_id ||
      body.mission_id ||
      null;

    const access =
      await requireOrganizationAccess({
        organizationId,
      });

    if (!access.success) {
      return NextResponse.json(
        access,
        { status: access.status },
      );
    }

    if (!projectId) {
      return response({
        success: false,
        status: 400,
        error:
          "creative_project_id required",
      });
    }

    if (!missionId) {
      return response({
        success: false,
        status: 400,
        error:
          "creative_mission_id required",
      });
    }

    thresholds = {
      max_temporal_attempts:
        Math.max(
          1,
          number(
            body.max_temporal_attempts,
            6,
          ),
        ),
      max_recovery_handler_calls:
        Math.max(
          0,
          number(
            body.max_recovery_handler_calls,
            6,
          ),
        ),
    };

    const createInvocation = await invoke({
      handler: directorJobPost,
      req,
      pathname:
        "/api/creative/director-jobs",
      body: {
        ...body,
        organization_id:
          organizationId,
        creative_project_id:
          projectId,
        creative_mission_id:
          missionId,
        action: "create",
      },
    });

    if (!createInvocation.ok) {
      return response({
        success: false,
        status:
          createInvocation.status,
        error:
          createInvocation.payload?.error ||
          "CREATIVE_CANARY_V2_JOB_CREATE_FAILED",
        details:
          createInvocation.payload,
        events,
        thresholds,
      });
    }

    created = {
      asset_count:
        createInvocation.payload
          ?.asset_count ?? null,
      asset_resolution:
        createInvocation.payload
          ?.asset_resolution || null,
    };
    jobId =
      createInvocation.payload?.job?.id ||
      null;

    if (!jobId) {
      return response({
        success: false,
        status: 500,
        error:
          "CREATIVE_CANARY_V2_CREATED_JOB_ID_MISSING",
        details:
          createInvocation.payload,
        events,
        thresholds,
        created,
      });
    }

    const seenFailedStates = new Set();

    for (
      let cycle = 1;
      cycle <= MAX_CYCLES;
      cycle += 1
    ) {
      const before = await getJob({
        jobId,
        organizationId,
      });

      if (before.status === "COMPLETED") {
        break;
      }

      const step = currentStep(before);
      const stepKey =
        before.current_step_key;
      const stepStatus =
        step?.status || null;
      let kind = "ADVANCE";
      let handler = directorJobPost;
      let pathname =
        "/api/creative/director-jobs";
      let payload = {
        organization_id:
          organizationId,
        job_id: jobId,
        action: "advance",
        retry_failed: false,
      };

      if (stepStatus === "FAILED") {
        const failedState =
          stateFingerprint(before);

        if (seenFailedStates.has(failedState)) {
          return response({
            success: false,
            status: 422,
            error:
              "CREATIVE_CANARY_V2_REPEATED_FAILED_STATE_BLOCKED",
            details: {
              job_id: jobId,
              step_key: stepKey,
              failed_state:
                JSON.parse(failedState),
            },
            events,
            thresholds,
            created,
            job: before,
          });
        }

        seenFailedStates.add(failedState);

        if (
          stepKey ===
          "temporal_shot_direction"
        ) {
          kind = "TEMPORAL_CONVERGENCE";
          handler = convergeTemporalPost;
          pathname =
            "/api/creative/director-jobs/converge-temporal";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
          };
        } else if (
          stepKey === "targeted_repair_1"
        ) {
          kind =
            "STORYBOARD_CONVERGENCE_1";
          handler = convergeStoryboardPost;
          pathname =
            "/api/creative/director-jobs/converge-storyboard";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
          };
        } else if (
          stepKey === "targeted_repair_2"
        ) {
          kind =
            "ADAPTIVE_STORYBOARD_CONVERGENCE_2";
          handler =
            convergeAdaptiveStoryboardPost;
          pathname =
            "/api/creative/director-jobs/converge-storyboard-adaptive";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
          };
        } else {
          return response({
            success: false,
            status: 422,
            error:
              "CREATIVE_CANARY_V2_UNSUPPORTED_FAILED_STEP",
            details: {
              job_id: jobId,
              step_key: stepKey,
              step_status: stepStatus,
              step_error:
                step?.error ||
                before.error ||
                null,
            },
            events,
            thresholds,
            created,
            job: before,
          });
        }
      }

      const invocation = await invoke({
        handler,
        req,
        pathname,
        body: payload,
      });
      const after = await getJob({
        jobId,
        organizationId,
      });
      const recorded = eventRecord({
        cycle,
        kind,
        before,
        invocation,
        after,
      });

      events.push(recorded);

      if (!recorded.durable_progress) {
        return response({
          success: false,
          status: 422,
          error:
            "CREATIVE_CANARY_V2_HANDLER_MADE_NO_DURABLE_PROGRESS",
          details: {
            job_id: jobId,
            kind,
            handler_status:
              invocation.status,
            handler_payload:
              invocation.payload,
            durable_state:
              recorded.after,
          },
          events,
          thresholds,
          created,
          job: after,
        });
      }

      if (
        !invocation.ok &&
        after.status !== "FAILED" &&
        after.status !== "COMPLETED"
      ) {
        return response({
          success: false,
          status:
            invocation.status,
          error:
            invocation.payload?.error ||
            "CREATIVE_CANARY_V2_HANDLER_FAILED",
          details: {
            handler_payload:
              invocation.payload,
            durable_state:
              recorded.after,
          },
          events,
          thresholds,
          created,
          job: after,
        });
      }
    }

    const job = await getJob({
      jobId,
      organizationId,
    });

    if (job.status !== "COMPLETED") {
      return response({
        success: false,
        status: 422,
        error:
          "CREATIVE_CANARY_V2_CYCLE_LIMIT_REACHED",
        details: {
          cycle_limit: MAX_CYCLES,
          current_step:
            job.current_step_key,
          current_status:
            job.status,
        },
        events,
        thresholds,
        created,
        job,
      });
    }

    const row = await getPipeline({
      jobId,
      organizationId,
    });
    const provenance =
      inspectCreativeRepairProvenance({
        pipelineResult:
          row.pipeline_result,
      });
    const verdict = releaseVerdict({
      job,
      events,
      provenance,
      thresholds,
    });

    return response({
      success:
        verdict.plan_only_canary_passed,
      status:
        verdict.plan_only_canary_passed
          ? 200
          : 422,
      verdict,
      job,
      events,
      provenance,
      thresholds,
      created,
    });
  } catch (error) {
    let job = null;

    if (jobId && organizationId) {
      try {
        job = await getJob({
          jobId,
          organizationId,
        });
      } catch {
        job = null;
      }
    }

    return response({
      success: false,
      status: errorStatus(error),
      error:
        error.message ||
        "CREATIVE_GREENFIELD_CANARY_V2_FAILED",
      details: {
        code: error.code || null,
        runtime_details:
          error.details || null,
        cause:
          error.cause?.message ||
          null,
      },
      events,
      job,
      created,
      thresholds,
    });
  }
}
