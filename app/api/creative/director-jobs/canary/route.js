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
  classifyCreativeJobFailure,
} from "@/lib/creative/director/runtime/CreativeFailureRouter";

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
  POST as convergeFinalStoryboardPost,
} from "../converge-storyboard-final/route";

const JOBS = "creative_director_jobs";
const MAX_CYCLES = 24;

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

function temporalStep(job = {}) {
  return list(job.steps).find(
    (step) =>
      step?.step_key ===
      "temporal_shot_direction",
  ) || null;
}

function finalAuditStep(job = {}) {
  return list(job.steps).find(
    (step) =>
      step?.step_key === "final_audit",
  ) || null;
}

function currentStep(job = {}) {
  if (!job.current_step_key) return null;

  return list(job.steps).find(
    (step) =>
      step?.step_key ===
      job.current_step_key,
  ) || null;
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          stableValue(value[key]),
        ]),
    );
  }

  return value;
}

function progressSignature(job = {}) {
  const step = currentStep(job);

  return JSON.stringify(
    stableValue({
      job_status: job.status || null,
      current_step_key:
        job.current_step_key || null,
      current_step_index:
        job.current_step_index ?? null,
      completed_steps:
        job.completed_steps ?? null,
      progress_percent:
        job.progress_percent ?? null,
      step_status: step?.status || null,
      step_attempt: step?.attempt ?? null,
      step_error: step?.error || null,
      job_error: job.error || null,
    }),
  );
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

  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = {
      success: false,
      error:
        "CREATIVE_CANARY_HANDLER_RESPONSE_INVALID",
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
      "id,organization_id,pipeline_result,current_plan,storyboard_audit,error,status",
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

function event({
  cycle,
  kind,
  before,
  invocation,
  after,
}) {
  const beforeStep = currentStep(before);
  const afterStep = currentStep(after);

  return {
    cycle,
    kind,
    before: {
      job_status:
        before.status || null,
      step_key:
        before.current_step_key || null,
      step_status:
        beforeStep?.status || null,
      step_attempt:
        beforeStep?.attempt || null,
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
    },
    after: {
      job_status:
        after.status || null,
      step_key:
        after.current_step_key || null,
      step_status:
        afterStep?.status || null,
      step_attempt:
        afterStep?.attempt || null,
      error:
        afterStep?.error ||
        after.error ||
        null,
    },
  };
}

function canaryResponse({
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
    code.includes("UNSUPPORTED")
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
  const temporal = temporalStep(job);
  const finalAudit = finalAuditStep(job);
  const recoveryEvents = events.filter(
    (entry) =>
      entry.kind !== "ADVANCE",
  );

  const planOnlyCanaryPassed = Boolean(
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

  const recoveryCount =
    recoveryEvents.length;

  const thresholdPassed = Boolean(
    temporalAttempt <=
      thresholds.max_temporal_attempts &&
    recoveryCount <=
      thresholds.max_recovery_handler_calls,
  );

  const releaseReady = Boolean(
    planOnlyCanaryPassed &&
    provenance.passed &&
    thresholdPassed
  );

  const blockers = [];

  if (!planOnlyCanaryPassed) {
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
    recoveryCount >
    thresholds.max_recovery_handler_calls
  ) {
    blockers.push(
      "RECOVERY_HANDLER_THRESHOLD_EXCEEDED",
    );
  }

  return {
    plan_only_canary_passed:
      planOnlyCanaryPassed,
    release_ready: releaseReady,
    release_verdict:
      releaseReady
        ? "RELEASE_READY"
        : planOnlyCanaryPassed
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
    recovery_handler_calls:
      recoveryCount,
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
      return canaryResponse({
        success: false,
        status: 400,
        error:
          "creative_project_id required",
      });
    }

    if (!missionId) {
      return canaryResponse({
        success: false,
        status: 400,
        error:
          "creative_mission_id required",
      });
    }

    const thresholds = {
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
      return canaryResponse({
        success: false,
        status:
          createInvocation.status,
        error:
          createInvocation.payload?.error ||
          "CREATIVE_CANARY_JOB_CREATE_FAILED",
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
      return canaryResponse({
        success: false,
        status: 500,
        error:
          "CREATIVE_CANARY_CREATED_JOB_ID_MISSING",
        details:
          createInvocation.payload,
        events,
        thresholds,
        created,
      });
    }

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
        const routing =
          classifyCreativeJobFailure(before);

        if (!routing.retryable) {
          return canaryResponse({
            success: false,
            status: 422,
            error:
              "CREATIVE_CANARY_FAILURE_REQUIRES_REVIEW",
            details: {
              routing,
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

        if (
          routing.route ===
          "STRUCTURAL_REPLAN"
        ) {
          kind = "STRUCTURAL_REPLAN";
          handler = directorJobPost;
          pathname =
            "/api/creative/director-jobs";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
            action: "replan_structure",
            reason:
              step?.error ||
              before.error ||
              routing,
          };
        } else if (
          routing.route ===
          "TEMPORAL_REFERENCE_RECOVERY" ||
          routing.route ===
          "TEMPORAL_CONVERGENCE"
        ) {
          kind = routing.route;
          handler = convergeTemporalPost;
          pathname =
            "/api/creative/director-jobs/converge-temporal";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
          };
        } else if (
          routing.route ===
          "TARGETED_STORYBOARD_REPAIR"
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
          routing.route ===
          "FINAL_EVIDENCE_REPAIR"
        ) {
          kind =
            "STORYBOARD_CONVERGENCE_2";
          handler =
            convergeFinalStoryboardPost;
          pathname =
            "/api/creative/director-jobs/converge-storyboard-final";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
          };
        } else {
          kind = "RETRY_FAILED_STEP";
          handler = directorJobPost;
          pathname =
            "/api/creative/director-jobs";
          payload = {
            organization_id:
              organizationId,
            job_id: jobId,
            action: "advance",
            retry_failed: true,
          };
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

      events.push(
        event({
          cycle,
          kind,
          before,
          invocation,
          after,
        }),
      );

      const afterStep =
        currentStep(after);

      if (
        invocation.payload?.error ===
        "CREATIVE_FINAL_STORYBOARD_STRUCTURAL_REPLAN_REQUIRED"
      ) {
        const replanInvocation = await invoke({
          handler: directorJobPost,
          req,
          pathname:
            "/api/creative/director-jobs",
          body: {
            organization_id:
              organizationId,
            job_id: jobId,
            action: "replan_structure",
            reason:
              invocation.payload,
          },
        });

        const replanned = await getJob({
          jobId,
          organizationId,
        });

        events.push(
          event({
            cycle,
            kind: "STRUCTURAL_REPLAN",
            before: after,
            invocation: replanInvocation,
            after: replanned,
          }),
        );

        if (!replanInvocation.ok) {
          return canaryResponse({
            success: false,
            status:
              replanInvocation.status,
            error:
              replanInvocation.payload
                ?.error ||
              "CREATIVE_STRUCTURAL_REPLAN_FAILED",
            details:
              replanInvocation.payload,
            events,
            thresholds,
            created,
            job: replanned,
          });
        }

        continue;
      }

      if (
        stepStatus === "FAILED" &&
        afterStep?.status === "FAILED" &&
        progressSignature(before) ===
          progressSignature(after)
      ) {
        return canaryResponse({
          success: false,
          status: 422,
          error:
            "CREATIVE_CANARY_NO_PROGRESS",
          details: {
            reason:
              "The recovery handler returned without changing the failed job state. Automatic retry was stopped to prevent a non-mutating loop.",
            cycle,
            handler_kind: kind,
            handler_payload:
              invocation.payload,
            step_key: stepKey,
            step_status:
              afterStep?.status || null,
            step_attempt:
              afterStep?.attempt ?? null,
            state_signature:
              progressSignature(after),
          },
          events,
          thresholds,
          created,
          job: after,
        });
      }

      if (
        !invocation.ok &&
        after.status !== "COMPLETED"
      ) {
        if (
          afterStep?.status !== "FAILED"
        ) {
          return canaryResponse({
            success: false,
            status:
              invocation.status,
            error:
              invocation.payload?.error ||
              "CREATIVE_CANARY_HANDLER_FAILED",
            details: {
              handler_payload:
                invocation.payload,
              step_key:
                after.current_step_key,
              step_status:
                afterStep?.status || null,
            },
            events,
            thresholds,
            created,
            job: after,
          });
        }
      }
    }

    const job = await getJob({
      jobId,
      organizationId,
    });

    if (job.status !== "COMPLETED") {
      return canaryResponse({
        success: false,
        status: 422,
        error:
          "CREATIVE_CANARY_CYCLE_LIMIT_REACHED",
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

    return canaryResponse({
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

    return canaryResponse({
      success: false,
      status: errorStatus(error),
      error:
        error.message ||
        "CREATIVE_GREENFIELD_CANARY_FAILED",
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
    });
  }
}
