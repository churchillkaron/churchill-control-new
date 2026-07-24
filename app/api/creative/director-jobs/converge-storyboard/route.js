export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  reason,
} from "@/lib/creative/reasoning/CreativeReasoningService";

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
const REPAIR_STEP = "targeted_repair_1";
const NEXT_STEP = "audit_2";
const MAX_GROUPS = 24;
const MAX_ATTEMPTS = 2;

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

function now() {
  return new Date().toISOString();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function deepMerge(base, patch) {
  if (patch === undefined || patch === null) return clone(base);
  if (Array.isArray(patch)) return clone(patch);

  if (
    base &&
    patch &&
    typeof base === "object" &&
    typeof patch === "object" &&
    !Array.isArray(base) &&
    !Array.isArray(patch)
  ) {
    const output = clone(base) || {};
    for (const [key, value] of Object.entries(patch)) {
      output[key] = deepMerge(base[key], value);
    }
    return output;
  }

  return clone(patch);
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

function latestStoredAudit(job = {}) {
  const state = object(job.storyboard_audit);
  return list(state.history).at(-1) || state.latest || null;
}

function addressSignature(plan = {}) {
  return list(plan.scenes).map((scene, sceneIndex) => ({
    scene_number: sceneIndex + 1,
    shot_numbers: list(scene.shots).map((_, shotIndex) => shotIndex + 1),
  }));
}

function planDuration(plan = {}) {
  return list(plan.scenes).reduce(
    (total, scene) =>
      total + list(scene.shots).reduce(
        (shotTotal, shot) =>
          shotTotal + Number(shot.duration_seconds || 0),
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

function groupFailures(audit, group) {
  return list(audit.storyboard.failure_details).filter((detail) =>
    detail.scope === group.scope &&
    Number(detail.scene_number || 0) === Number(group.scene_number || 0) &&
    Number(detail.shot_number || 0) === Number(group.shot_number || 0),
  );
}

function newFailures(before, after) {
  const previous = new Set(list(before.failures).map(String));
  return list(after.failures).map(String).filter((failure) =>
    !previous.has(failure),
  );
}

function sceneAndShot(plan, group) {
  const scene = group.scene_number
    ? list(plan.scenes)[Number(group.scene_number) - 1]
    : null;
  const shot = scene && group.shot_number
    ? list(scene.shots)[Number(group.shot_number) - 1]
    : null;
  return { scene, shot };
}

function outputShape(group) {
  if (group.scope === "SHOT") {
    return {
      result: {
        scene_number: group.scene_number,
        shot_number: group.shot_number,
        shot_patch: {},
        addressed_failures: [],
        preserved_fields: [],
        decisions: [],
        risks: [],
      },
    };
  }

  if (group.scope === "SCENE") {
    return {
      result: {
        scene_number: group.scene_number,
        scene_patch: {},
        addressed_failures: [],
        preserved_fields: [],
        decisions: [],
        risks: [],
      },
    };
  }

  return {
    result: {
      top_level_patch: {},
      addressed_failures: [],
      preserved_fields: [],
      decisions: [],
      risks: [],
    },
  };
}

function applyPatch({ plan, group, result }) {
  const output = clone(plan);

  if (group.scope === "PLAN") {
    const patch = clone(object(result.top_level_patch || result.plan_patch));
    if (Object.prototype.hasOwnProperty.call(patch, "scenes")) {
      throw new Error("CREATIVE_STORYBOARD_PLAN_PATCH_SCENES_FORBIDDEN");
    }
    return deepMerge(output, patch);
  }

  const sceneIndex = Number(group.scene_number) - 1;
  const scene = object(output.scenes?.[sceneIndex]);
  if (!Object.keys(scene).length) {
    throw new Error("CREATIVE_STORYBOARD_REPAIR_SCENE_NOT_FOUND");
  }

  if (group.scope === "SCENE") {
    const patch = clone(object(result.scene_patch || result.patch));
    if (Object.prototype.hasOwnProperty.call(patch, "shots")) {
      throw new Error("CREATIVE_STORYBOARD_SCENE_PATCH_SHOTS_FORBIDDEN");
    }
    output.scenes[sceneIndex] = {
      ...deepMerge(scene, patch),
      scene_number: Number(group.scene_number),
      shots: scene.shots,
    };
    return output;
  }

  const shotIndex = Number(group.shot_number) - 1;
  const shot = object(scene.shots?.[shotIndex]);
  if (!Object.keys(shot).length) {
    throw new Error("CREATIVE_STORYBOARD_REPAIR_SHOT_NOT_FOUND");
  }

  const patch = clone(object(result.shot_patch || result.patch));
  for (const forbidden of [
    "scene_number",
    "shot_number",
    "duration_seconds",
    "duration",
    "reference_asset_ids",
    "assets",
    "master_still_contract",
    "temporal_contract",
  ]) {
    delete patch[forbidden];
  }

  output.scenes[sceneIndex].shots[shotIndex] = {
    ...deepMerge(shot, patch),
    shot_number: Number(group.shot_number),
    duration_seconds: shot.duration_seconds,
    reference_asset_ids: clone(shot.reference_asset_ids),
    assets: clone(shot.assets),
    master_still_contract: clone(shot.master_still_contract),
    temporal_contract: clone(shot.temporal_contract),
  };

  return output;
}

function validateCandidate({
  before,
  after,
  currentPlan,
  candidatePlan,
  group,
}) {
  const reasons = [];

  if (
    JSON.stringify(addressSignature(currentPlan)) !==
    JSON.stringify(addressSignature(candidatePlan))
  ) {
    reasons.push("SCENE_OR_SHOT_STRUCTURE_CHANGED");
  }

  if (Math.abs(planDuration(currentPlan) - planDuration(candidatePlan)) > 0.001) {
    reasons.push("DURATION_CHANGED");
  }

  if (
    JSON.stringify(referenceIds(currentPlan)) !==
    JSON.stringify(referenceIds(candidatePlan))
  ) {
    reasons.push("CANONICAL_REFERENCE_SET_CHANGED");
  }

  if (!after.temporal.passed) {
    reasons.push("TEMPORAL_CONTRACT_REGRESSED");
  }

  if (after.temporal.total_frames < before.temporal.total_frames) {
    reasons.push("TEMPORAL_FRAME_COVERAGE_REGRESSED");
  }

  if (after.temporal.timed_item_count < before.temporal.timed_item_count) {
    reasons.push("TEMPORAL_TIMED_ITEMS_REGRESSED");
  }

  const introduced = newFailures(before, after);
  if (introduced.length) reasons.push("NEW_FAILURES_INTRODUCED");

  const beforeGroupCount = groupFailures(before, group).length;
  const afterGroupCount = groupFailures(after, group).length;

  if (after.failure_count >= before.failure_count) {
    reasons.push("TOTAL_FAILURE_COUNT_DID_NOT_IMPROVE");
  }

  if (afterGroupCount >= beforeGroupCount) {
    reasons.push("ADDRESSED_GROUP_DID_NOT_IMPROVE");
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    introduced_failures: introduced,
    before_failure_count: before.failure_count,
    after_failure_count: after.failure_count,
    before_group_failure_count: beforeGroupCount,
    after_group_failure_count: afterGroupCount,
  };
}

async function focusedRepair({ job, plan, audit, group, attempt }) {
  const { scene, shot } = sceneAndShot(plan, group);
  const exactFailures = groupFailures(audit, group);

  const execution = await reason({
    task: [
      `Repair only the ${group.scope.toLowerCase()} storyboard contract at ${group.key}.`,
      "Address every exact supplied failure in this bounded scope.",
      "Return only the smallest patch needed for these failures.",
      "Do not rewrite the production bible or alter another scene or shot.",
      "Do not change structure, duration, canonical references, master-still contracts, temporal contracts, identities, factual claims, venue geometry or unrelated decisions.",
      "Use the canonical field names already present in the production bible.",
      "Every value must be concrete, mission-specific and independently executable; no generic cinematic filler or schema placeholders.",
      "Preserve all valid existing fields and list the exact failures addressed.",
    ].join(" "),
    input: {
      organization_id: job.organization_id,
      creative_project_id: job.creative_project_id,
      creative_mission_id: job.creative_mission_id,
      objective: object(job.input_snapshot).objective,
      brief: object(job.input_snapshot).brief,
      scope: group,
      repair_attempt: attempt,
      exact_failures: exactFailures,
      current_scene: scene,
      current_shot: shot,
      current_top_level: {
        title: plan.title,
        concept: plan.concept,
        narrative: plan.narrative,
        objective: plan.objective,
      },
      canonical_assets: list(job.asset_snapshot),
    },
    constraints: {
      exactly_one_failure_group: true,
      exact_scene_number: group.scene_number,
      exact_shot_number: group.shot_number,
      preserve_structure: true,
      preserve_duration: true,
      preserve_references: true,
      preserve_master_still: true,
      preserve_temporal_contract: true,
      preserve_unaddressed_fields: true,
      every_change_must_trace_to_failure: true,
      no_complete_plan_replacement: true,
      no_generic_filler: true,
    },
    outputShape: outputShape(group),
    temperature: attempt === 1 ? 0.2 : 0.1,
    maxOutputTokens: 7000,
    timeoutMs: 240000,
    metadata: {
      creative_director_job_id: job.id,
      creative_director_step_key: REPAIR_STEP,
      storyboard_repair_scope: group.key,
      storyboard_repair_attempt: attempt,
    },
  });

  if (execution.fallback || execution.recovery) {
    const error = new Error("CREATIVE_STORYBOARD_FOCUSED_REPAIR_REASONING_FAILED");
    error.code = "CREATIVE_STORYBOARD_FOCUSED_REPAIR_REASONING_FAILED";
    error.details = {
      group,
      attempt,
      fallback_reason: execution.fallback_reason,
    };
    throw error;
  }

  return {
    execution,
    result: object(execution.result),
  };
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

async function getStep(jobId, key) {
  const { data, error } = await supabaseAdmin
    .from(STEPS)
    .select("*")
    .eq("job_id", jobId)
    .eq("step_key", key)
    .single();
  if (error) throw error;
  return data;
}

async function persistPlan({ job, plan, convergence }) {
  const pipeline = object(job.pipeline_result);
  const { error } = await supabaseAdmin
    .from(JOBS)
    .update({
      current_plan: plan,
      pipeline_result: {
        ...pipeline,
        storyboard_convergence: convergence,
      },
      updated_at: now(),
    })
    .eq("id", job.id)
    .eq("organization_id", job.organization_id);
  if (error) throw error;
}

async function progress(jobId) {
  const { data, error } = await supabaseAdmin
    .from(STEPS)
    .select("status")
    .eq("job_id", jobId);
  if (error) throw error;
  const steps = data || [];
  const completed = steps.filter((step) =>
    ["COMPLETED", "SKIPPED"].includes(step.status),
  ).length;
  return {
    completed_steps: completed,
    progress_percent: steps.length
      ? Math.round((completed / steps.length) * 10000) / 100
      : 0,
  };
}

async function completeRepairStep({ job, step, plan, audit, convergence }) {
  const completedAt = now();
  const baseline = Number(
    convergence.stored_audit_failure_count ??
    convergence.initial_failure_count ??
    0,
  );

  const { error: stepError } = await supabaseAdmin
    .from(STEPS)
    .update({
      status: "COMPLETED",
      provider: convergence.executions.find((item) => item.provider)?.provider || null,
      model: convergence.executions.find((item) => item.model)?.model || null,
      confidence: convergence.executions.length
        ? convergence.executions.reduce(
            (total, item) => total + Number(item.confidence || 0),
            0,
          ) / convergence.executions.length
        : null,
      duration_ms: convergence.duration_ms,
      metrics: {
        ...object(step.metrics),
        kind: "REPAIR",
        convergence_version: "failure-addressed-storyboard-v2",
        stored_audit_failure_count: baseline,
        normalized_initial_failure_count: convergence.initial_failure_count,
        final_failure_count: audit.failure_count,
        failures_removed_from_stored_audit: baseline - audit.failure_count,
        normalization_reconciliation_count:
          convergence.normalization_reconciliation_count,
        accepted_groups: convergence.accepted.length,
        rejected_attempts: convergence.rejected.length,
        temporal_preserved: audit.temporal.passed,
        total_frames: audit.temporal.total_frames,
        timed_item_count: audit.temporal.timed_item_count,
      },
      error: null,
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq("id", step.id);
  if (stepError) throw stepError;

  const nextStep = await getStep(job.id, NEXT_STEP);
  const progressValues = await progress(job.id);
  const pipeline = object(job.pipeline_result);

  const { error: jobError } = await supabaseAdmin
    .from(JOBS)
    .update({
      current_plan: plan,
      status: "WAITING",
      current_step_key: NEXT_STEP,
      current_step_index: nextStep.step_index,
      error: null,
      lease_token: null,
      lease_expires_at: null,
      completed_at: null,
      ...progressValues,
      pipeline_result: {
        ...pipeline,
        storyboard_convergence: convergence,
      },
      updated_at: completedAt,
    })
    .eq("id", job.id)
    .eq("organization_id", job.organization_id);
  if (jobError) throw jobError;
}

function response({
  success,
  status = 200,
  error = null,
  details = null,
  audit = null,
  convergence = null,
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
    convergence,
  }, { status });
}

export async function POST(req) {
  const startedAt = Date.now();

  try {
    const body = await req.json();
    const organizationId = body.organization_id || body.organizationId || null;
    const jobId = body.job_id || body.jobId || null;

    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) {
      return NextResponse.json(access, { status: access.status });
    }

    if (!jobId) {
      return response({ success: false, status: 400, error: "job_id required" });
    }

    let job = await getJob(jobId, organizationId);
    const step = await getStep(jobId, REPAIR_STEP);

    if (!["FAILED", "WAITING"].includes(step.status)) {
      return response({
        success: false,
        status: 409,
        error: "CREATIVE_STORYBOARD_REPAIR_STEP_NOT_AVAILABLE",
        details: {
          step_status: step.status,
          step_attempt: step.attempt,
        },
      });
    }

    const storedAudit = latestStoredAudit(job);
    const storedFailureCount = Number(
      storedAudit?.failure_count ??
      step.error?.details?.previous_failure_count ??
      step.error?.details?.before?.failure_count ??
      0,
    );

    let plan = normalizeCreativeStoryboardPlan(object(job.current_plan));
    const input = object(job.input_snapshot);
    const assets = list(job.asset_snapshot);
    let audit = inspectPlan({ plan, input, assets });

    const convergence = {
      version: "failure-addressed-storyboard-v2",
      started_at: now(),
      stored_audit_failure_count: storedFailureCount,
      initial_failure_count: audit.failure_count,
      initial_storyboard_failure_count: audit.storyboard.failures.length,
      normalization_reconciliation_count: Math.max(
        0,
        storedFailureCount - audit.failure_count,
      ),
      temporal_initially_passed: audit.temporal.passed,
      accepted: [],
      rejected: [],
      executions: [],
    };

    if (!audit.temporal.passed) {
      return response({
        success: false,
        status: 422,
        error: "CREATIVE_STORYBOARD_CONVERGENCE_REQUIRES_VALID_TEMPORAL_BASELINE",
        audit,
        convergence,
      });
    }

    await persistPlan({
      job,
      plan: audit.plan,
      convergence: {
        ...convergence,
        phase: "CANONICAL_NORMALIZATION_PERSISTED",
        updated_at: now(),
      },
    });
    plan = audit.plan;
    job = await getJob(jobId, organizationId);

    for (let groupIndex = 0; groupIndex < MAX_GROUPS; groupIndex += 1) {
      if (audit.storyboard.passed) break;

      const group = list(audit.storyboard.failure_groups)[0];
      if (!group) break;

      let accepted = false;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const repair = await focusedRepair({
          job,
          plan,
          audit,
          group,
          attempt,
        });

        convergence.executions.push({
          group: group.key,
          attempt,
          provider: repair.execution.provider || null,
          model: repair.execution.model || null,
          confidence: Number(repair.execution.confidence || 0),
        });

        const candidatePlan = applyPatch({
          plan,
          group,
          result: repair.result,
        });
        const candidateAudit = inspectPlan({
          plan: candidatePlan,
          input,
          assets,
        });
        const validation = validateCandidate({
          before: audit,
          after: candidateAudit,
          currentPlan: plan,
          candidatePlan,
          group,
        });

        if (!validation.accepted) {
          convergence.rejected.push({
            group: group.key,
            attempt,
            validation,
            addressed_failures: list(repair.result.addressed_failures),
          });
          continue;
        }

        plan = candidateAudit.plan;
        audit = candidateAudit;
        accepted = true;

        convergence.accepted.push({
          group: group.key,
          scope: group.scope,
          scene_number: group.scene_number,
          shot_number: group.shot_number,
          owners: group.owners,
          attempt,
          validation,
          addressed_failures: list(repair.result.addressed_failures),
          accepted_at: now(),
        });
        convergence.current_failure_count = audit.failure_count;

        await persistPlan({
          job,
          plan,
          convergence: {
            ...convergence,
            phase: "GROUP_ACCEPTED",
            updated_at: now(),
          },
        });
        job = await getJob(jobId, organizationId);
        break;
      }

      if (!accepted) {
        convergence.stopped_on_group = group;
        convergence.stop_reason = "GROUP_DID_NOT_PRODUCE_MEASURABLE_IMPROVEMENT";
        break;
      }
    }

    audit = inspectPlan({ plan, input, assets });
    convergence.completed_at = now();
    convergence.duration_ms = Date.now() - startedAt;
    convergence.final_failure_count = audit.failure_count;
    convergence.final_storyboard_failure_count = audit.storyboard.failures.length;
    convergence.temporal_preserved = audit.temporal.passed;
    convergence.total_frames = audit.temporal.total_frames;
    convergence.timed_item_count = audit.temporal.timed_item_count;
    convergence.passed = audit.passed;

    const effectiveBaseline = storedFailureCount > 0
      ? storedFailureCount
      : convergence.initial_failure_count;
    const improved = audit.failure_count < effectiveBaseline;

    if (!improved) {
      return response({
        success: false,
        status: 422,
        error: "CREATIVE_STORYBOARD_CONVERGENCE_DID_NOT_IMPROVE",
        details: {
          effective_baseline: effectiveBaseline,
          final_failure_count: audit.failure_count,
        },
        audit,
        convergence,
      });
    }

    await completeRepairStep({
      job,
      step,
      plan: audit.plan,
      audit,
      convergence,
    });

    return response({
      success: true,
      audit,
      convergence,
    });
  } catch (error) {
    return response({
      success: false,
      status: 500,
      error: error.message || "CREATIVE_STORYBOARD_CONVERGENCE_FAILED",
      details: {
        code: error.code || null,
        runtime_details: error.details || null,
        cause: error.cause?.message || null,
      },
    });
  }
}
