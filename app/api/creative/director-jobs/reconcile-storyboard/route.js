export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  inspectCreativeStoryboardPlan,
  normalizeCreativeStoryboardPlan,
} from "@/lib/creative/storyboard/runtime/CreativeStoryboardPlanContract";

import {
  inspectCreativeShotTemporalContract,
} from "@/lib/creative/director/runtime/CreativeShotTemporalContract";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

const JOBS = "creative_director_jobs";
const STEPS = "creative_director_job_steps";
const REPAIR_STEP = "targeted_repair_2";
const NEXT_STEP = "final_audit";

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function now() {
  return new Date().toISOString();
}

function addressSignature(plan = {}) {
  return list(plan.scenes).map((scene, sceneIndex) => ({
    scene_number: sceneIndex + 1,
    shot_numbers: list(scene.shots).map((_, shotIndex) => shotIndex + 1),
  }));
}

function durationSeconds(plan = {}) {
  return list(plan.scenes).reduce(
    (total, scene) =>
      total + list(scene.shots).reduce(
        (shotTotal, shot) =>
          shotTotal + Number(
            shot.duration_seconds ??
            shot.duration ??
            0,
          ),
        0,
      ),
    0,
  );
}

function referenceIds(plan = {}) {
  return unique(
    list(plan.scenes).flatMap((scene) =>
      list(scene.shots).flatMap((shot) => [
        ...list(shot.reference_asset_ids),
        ...list(shot.assets),
        ...list(shot.master_still_contract?.reference_asset_ids),
      ]),
    ),
  ).sort();
}

function inspectPlan({ plan, input, assets }) {
  const storyboard = inspectCreativeStoryboardPlan({
    creativePlan: plan,
    targetDuration: input.target_duration_seconds,
    brief: input.brief,
    assets,
  });

  const reports = list(storyboard.creativePlan.scenes).flatMap(
    (scene, sceneIndex) =>
      list(scene.shots).map((shot, shotIndex) =>
        inspectCreativeShotTemporalContract({
          shot,
          fps: Number(input.fps || 30),
          label: `scene ${sceneIndex + 1} shot ${shotIndex + 1}`,
        }).report,
      ),
  );

  const temporalFailures = reports.flatMap((report) =>
    list(report.failures),
  );
  const failures = [
    ...list(storyboard.report.failures),
    ...temporalFailures,
  ];

  return {
    plan: storyboard.creativePlan,
    passed: failures.length === 0,
    failure_count: failures.length,
    failures,
    storyboard: storyboard.report,
    temporal: {
      passed: temporalFailures.length === 0,
      failures: temporalFailures,
      shot_count: reports.length,
      total_frames: reports.reduce(
        (total, report) => total + Number(report.total_frames || 0),
        0,
      ),
      timed_item_count: reports.reduce(
        (total, report) => total + Number(report.timed_item_count || 0),
        0,
      ),
      reports,
    },
  };
}

function latestAudit(job = {}) {
  const state = object(job.storyboard_audit);
  return list(state.history).at(-1) || state.latest || null;
}

async function getJob(jobId, organizationId) {
  const { data, error } = await supabaseAdmin
    .from(JOBS)
    .select("*")
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  return data;
}

async function getSteps(jobId) {
  const { data, error } = await supabaseAdmin
    .from(STEPS)
    .select("*")
    .eq("job_id", jobId)
    .order("step_index", { ascending: true });

  if (error) throw error;
  return data || [];
}

function response({
  success,
  status = 200,
  error = null,
  details = null,
  audit = null,
  reconciliation = null,
  job = null,
}) {
  return NextResponse.json({
    success,
    plan_only: true,
    production_dispatched: false,
    image_generation_started: false,
    video_generation_started: false,
    error,
    details,
    audit,
    reconciliation,
    job,
  }, { status });
}

export async function POST(req) {
  const startedAt = Date.now();

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
      return response({
        success: false,
        status: 400,
        error: "job_id required",
      });
    }

    const job = await getJob(
      jobId,
      organizationId,
    );
    const steps = await getSteps(jobId);
    const repairStep = steps.find((step) =>
      step.step_key === REPAIR_STEP,
    );
    const nextStep = steps.find((step) =>
      step.step_key === NEXT_STEP,
    );

    if (!repairStep || !nextStep) {
      return response({
        success: false,
        status: 409,
        error:
          "CREATIVE_STORYBOARD_RECONCILIATION_STEPS_MISSING",
        details: {
          repair_step_found: Boolean(repairStep),
          next_step_found: Boolean(nextStep),
        },
      });
    }

    if (repairStep.status !== "FAILED") {
      return response({
        success: false,
        status: 409,
        error:
          "CREATIVE_STORYBOARD_SECOND_REPAIR_NOT_FAILED",
        details: {
          status: repairStep.status,
          attempt: repairStep.attempt,
        },
      });
    }

    const originalPlan = object(job.current_plan);
    const normalizedPlan = normalizeCreativeStoryboardPlan(
      originalPlan,
    );
    const input = object(job.input_snapshot);
    const assets = list(job.asset_snapshot);
    const audit = inspectPlan({
      plan: normalizedPlan,
      input,
      assets,
    });

    const stored = latestAudit(job);
    const baseline = Number(
      stored?.failure_count ??
      repairStep.error?.details?.previous_failure_count ??
      repairStep.error?.details?.before?.failure_count ??
      0,
    );

    const structurePreserved =
      JSON.stringify(addressSignature(originalPlan)) ===
      JSON.stringify(addressSignature(audit.plan));
    const durationPreserved =
      Math.abs(
        durationSeconds(originalPlan) -
        durationSeconds(audit.plan),
      ) < 0.001;
    const referencesPreserved =
      JSON.stringify(referenceIds(originalPlan)) ===
      JSON.stringify(referenceIds(audit.plan));

    const reconciliation = {
      version:
        "canonical-temporal-storyboard-reconciliation-v2",
      started_at: now(),
      completed_at: now(),
      duration_ms: Date.now() - startedAt,
      repair_step: REPAIR_STEP,
      next_step: NEXT_STEP,
      stored_failure_count: baseline,
      reconciled_failure_count:
        audit.failure_count,
      failures_removed:
        baseline - audit.failure_count,
      storyboard_version:
        audit.storyboard.version || null,
      structure_preserved:
        structurePreserved,
      duration_preserved:
        durationPreserved,
      references_preserved:
        referencesPreserved,
      temporal_preserved:
        audit.temporal.passed,
      temporal_shot_count:
        audit.temporal.shot_count,
      total_frames:
        audit.temporal.total_frames,
      timed_item_count:
        audit.temporal.timed_item_count,
      passed: audit.passed,
    };

    const integrityFailures = [];

    if (!structurePreserved) {
      integrityFailures.push(
        "SCENE_OR_SHOT_STRUCTURE_CHANGED",
      );
    }
    if (!durationPreserved) {
      integrityFailures.push("DURATION_CHANGED");
    }
    if (!referencesPreserved) {
      integrityFailures.push(
        "CANONICAL_REFERENCE_SET_CHANGED",
      );
    }
    if (!audit.temporal.passed) {
      integrityFailures.push(
        "TEMPORAL_CONTRACT_REGRESSED",
      );
    }
    if (audit.temporal.shot_count !== 6) {
      integrityFailures.push(
        "TEMPORAL_SHOT_COUNT_CHANGED",
      );
    }
    if (audit.temporal.total_frames !== 900) {
      integrityFailures.push(
        "TEMPORAL_FRAME_COVERAGE_CHANGED",
      );
    }

    if (integrityFailures.length) {
      return response({
        success: false,
        status: 422,
        error:
          "CREATIVE_STORYBOARD_RECONCILIATION_INTEGRITY_REJECTED",
        details: {
          integrity_failures: integrityFailures,
        },
        audit,
        reconciliation,
      });
    }

    if (!audit.passed) {
      return response({
        success: false,
        status: 422,
        error:
          "CREATIVE_STORYBOARD_RECONCILIATION_REMAINING_FAILURES",
        details: {
          baseline_failure_count: baseline,
          remaining_failure_count:
            audit.failure_count,
          remaining_failures:
            audit.failures,
          remaining_groups:
            audit.storyboard.failure_groups,
        },
        audit,
        reconciliation,
      });
    }

    const completedAt = now();

    const { error: repairError } = await supabaseAdmin
      .from(STEPS)
      .update({
        status: "COMPLETED",
        duration_ms:
          reconciliation.duration_ms,
        metrics: {
          ...object(repairStep.metrics),
          kind: "REPAIR",
          reconciliation_version:
            reconciliation.version,
          stored_failure_count: baseline,
          final_failure_count: 0,
          failures_removed: baseline,
          temporal_preserved: true,
          temporal_shot_count:
            audit.temporal.shot_count,
          total_frames:
            audit.temporal.total_frames,
          timed_item_count:
            audit.temporal.timed_item_count,
          reasoning_calls: 0,
        },
        error: null,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", repairStep.id);

    if (repairError) throw repairError;

    const completedCount = steps.filter((step) =>
      ["COMPLETED", "SKIPPED"].includes(
        step.step_key === REPAIR_STEP
          ? "COMPLETED"
          : step.status,
      ),
    ).length;
    const progressPercent = steps.length
      ? Math.round(
          (completedCount / steps.length) *
          10000,
        ) / 100
      : 0;
    const pipeline = object(job.pipeline_result);

    const { error: jobError } = await supabaseAdmin
      .from(JOBS)
      .update({
        current_plan: audit.plan,
        status: "WAITING",
        current_step_key: NEXT_STEP,
        current_step_index:
          nextStep.step_index,
        completed_steps: completedCount,
        progress_percent:
          progressPercent,
        error: null,
        lease_token: null,
        lease_expires_at: null,
        completed_at: null,
        pipeline_result: {
          ...pipeline,
          storyboard_reconciliation:
            reconciliation,
        },
        updated_at: completedAt,
      })
      .eq("id", job.id)
      .eq(
        "organization_id",
        organizationId,
      );

    if (jobError) throw jobError;

    const resolvedJob = await getJob(
      jobId,
      organizationId,
    );

    return response({
      success: true,
      audit,
      reconciliation,
      job: resolvedJob,
    });
  } catch (error) {
    return response({
      success: false,
      status: 500,
      error:
        error.message ||
        "CREATIVE_STORYBOARD_RECONCILIATION_FAILED",
      details: {
        code: error.code || null,
        runtime_details:
          error.details || null,
        cause:
          error.cause?.message || null,
      },
    });
  }
}
