export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeDirectorJobRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorJobRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  POST as advanceDirectorJob,
} from "../route";

import {
  POST as recoverTemporalJob,
} from "../recover-temporal/route";

const TEMPORAL_STEP = "temporal_shot_direction";
const MAX_ORCHESTRATION_CYCLES = 24;

const REFERENCE_FAILURE =
  "CREATIVE_TEMPORAL_MASTER_STILL_REFERENCE_SET_INVALID";

const TEMPORAL_RECOVERY_FAILURES = new Set([
  "CREATIVE_TEMPORAL_DEPARTMENT_REJECTED",
  "CREATIVE_TEMPORAL_GOVERNANCE_REJECTED",
]);

const SUPPORTED_FAILURES = new Set([
  REFERENCE_FAILURE,
  ...TEMPORAL_RECOVERY_FAILURES,
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
}) {
  return CreativeDirectorJobRuntime.get({
    job_id: jobId,
    organization_id: organizationId,
    include_plan: false,
  });
}

function forwardedHeaders(req) {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  const cookie = req.headers.get("cookie");
  const authorization =
    req.headers.get("authorization");

  if (cookie) {
    headers.set("cookie", cookie);
  }

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
      headers: forwardedHeaders(req),
      body: JSON.stringify(body),
    },
  );
}

async function invokeHandler({
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
        "CREATIVE_TEMPORAL_INTERNAL_HANDLER_RESPONSE_INVALID",
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

function recoverySummary({
  cycle,
  type,
  before,
  invocation,
  after,
}) {
  const beforeFailure =
    temporalFailure(before);
  const afterFailure =
    temporalFailure(after);

  return {
    cycle,
    type,
    before: {
      job_status:
        before.status || null,
      step_status:
        temporalStep(before)?.status ||
        null,
      attempt:
        temporalStep(before)?.attempt ||
        null,
      failure_code:
        beforeFailure.code || null,
      failure_details:
        beforeFailure.details || null,
    },
    handler: {
      http_status: invocation.status,
      success:
        invocation.payload?.success === true,
      error:
        invocation.payload?.error || null,
      code:
        invocation.payload?.code || null,
      details:
        invocation.payload?.details || null,
      temporal_recovery:
        invocation.payload
          ?.temporal_recovery ||
        null,
      reference_recovery:
        invocation.payload
          ?.reference_recovery ||
        null,
      recovery_cycles:
        invocation.payload
          ?.recovery_cycles ||
        [],
    },
    after: {
      job_status:
        after.status || null,
      step_status:
        temporalStep(after)?.status ||
        null,
      attempt:
        temporalStep(after)?.attempt ||
        null,
      failure_code:
        afterFailure.code || null,
      failure_details:
        afterFailure.details || null,
    },
  };
}

function safeResponse({
  success,
  status = 200,
  temporalCompleted = false,
  error = null,
  details = null,
  recoveries = [],
  job = null,
  stage = null,
  cycle = null,
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
    stage,
    cycle,
    recoveries,
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
    code.includes("RECOVERY") ||
    code.includes("UNSUPPORTED")
  ) {
    return 422;
  }

  return 500;
}

export async function POST(req) {
  let organizationId = null;
  let jobId = null;
  let stage = "READ_REQUEST";
  let cycle = 0;
  const recoveries = [];

  try {
    const body = await req.json();

    organizationId =
      body.organization_id ||
      body.organizationId ||
      null;

    jobId =
      body.job_id ||
      body.jobId ||
      null;

    stage = "AUTHORIZE_ORGANIZATION";

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
        stage,
        recoveries,
      });
    }

    for (
      cycle = 1;
      cycle <= MAX_ORCHESTRATION_CYCLES;
      cycle += 1
    ) {
      stage = "READ_DURABLE_JOB";

      const before = await getJob({
        jobId,
        organizationId,
      });

      const beforeStep =
        temporalStep(before);

      if (
        beforeStep?.status ===
        "COMPLETED"
      ) {
        return safeResponse({
          success: true,
          temporalCompleted: true,
          recoveries,
          job: before,
          stage: "TEMPORAL_COMPLETED",
          cycle,
        });
      }

      const beforeFailure =
        temporalFailure(before);
      const code = String(
        beforeFailure.code || "",
      );

      if (!SUPPORTED_FAILURES.has(code)) {
        return safeResponse({
          success: false,
          status: 422,
          error:
            "CREATIVE_TEMPORAL_CONVERGENCE_UNSUPPORTED_FAILURE",
          details: beforeFailure,
          recoveries,
          job: before,
          stage:
            "UNSUPPORTED_FAILURE",
          cycle,
        });
      }

      let type;
      let invocation;

      if (code === REFERENCE_FAILURE) {
        type =
          "CANONICAL_REFERENCE_AND_ADVANCE";
        stage =
          "INVOKE_REFERENCE_RECOVERY_HANDLER";

        invocation = await invokeHandler({
          handler: advanceDirectorJob,
          req,
          pathname:
            "/api/creative/director-jobs",
          body: {
            organization_id:
              organizationId,
            job_id: jobId,
            action: "advance",
            retry_failed: true,
          },
        });
      } else {
        type =
          "TEMPORAL_DEPARTMENT_OR_GOVERNANCE_RECOVERY";
        stage =
          "INVOKE_TEMPORAL_RECOVERY_HANDLER";

        invocation = await invokeHandler({
          handler: recoverTemporalJob,
          req,
          pathname:
            "/api/creative/director-jobs/recover-temporal",
          body: {
            organization_id:
              organizationId,
            job_id: jobId,
          },
        });
      }

      stage =
        "READ_JOB_AFTER_HANDLER";

      const after = await getJob({
        jobId,
        organizationId,
      });

      recoveries.push(
        recoverySummary({
          cycle,
          type,
          before,
          invocation,
          after,
        }),
      );

      const afterStep =
        temporalStep(after);

      if (
        afterStep?.status ===
        "COMPLETED"
      ) {
        return safeResponse({
          success: true,
          temporalCompleted: true,
          recoveries,
          job: after,
          stage: "TEMPORAL_COMPLETED",
          cycle,
        });
      }

      const afterFailure =
        temporalFailure(after);
      const afterCode = String(
        afterFailure.code || "",
      );

      if (SUPPORTED_FAILURES.has(afterCode)) {
        continue;
      }

      return safeResponse({
        success: false,
        status:
          invocation.status >= 400
            ? invocation.status
            : 422,
        error:
          "CREATIVE_TEMPORAL_CONVERGENCE_REQUIRES_REVIEW",
        details: {
          handler_response:
            invocation.payload,
          current_failure:
            afterFailure,
        },
        recoveries,
        job: after,
        stage:
          "HANDLER_COMPLETED_WITH_UNSUPPORTED_FAILURE",
        cycle,
      });
    }

    stage = "CYCLE_LIMIT_REACHED";

    const finalJob = await getJob({
      jobId,
      organizationId,
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
      recoveries,
      job: finalJob,
      stage,
      cycle,
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

    return safeResponse({
      success: false,
      status: errorStatus(error),
      error:
        error.message ||
        "CREATIVE_TEMPORAL_CONVERGENCE_FAILED",
      details: {
        code: error.code || null,
        cause:
          error.cause?.message ||
          error.cause ||
          null,
        runtime_details:
          error.details || null,
        current_failure:
          job
            ? temporalFailure(job)
            : null,
      },
      recoveries,
      job,
      stage,
      cycle,
    });
  }
}
