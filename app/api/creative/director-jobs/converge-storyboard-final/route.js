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
const REPAIR_STEP = "targeted_repair_2";
const NEXT_STEP = "final_audit";
const MAX_GROUPS = 12;
const MAX_ATTEMPTS_PER_GROUP = 2;

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

function now() {
  return new Date().toISOString();
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

function deepMerge(base, patch) {
  if (patch === undefined || patch === null) {
    return clone(base);
  }

  if (Array.isArray(patch)) {
    return clone(patch);
  }

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
      output[key] = deepMerge(
        base[key],
        value,
      );
    }

    return output;
  }

  return clone(patch);
}

function inspectPlan({
  plan,
  input,
  assets,
}) {
  const storyboard = inspectCreativeStoryboardPlan({
    creativePlan: plan,
    targetDuration:
      input.target_duration_seconds,
    brief: input.brief,
    assets,
  });

  const reports = list(
    storyboard.creativePlan.scenes,
  ).flatMap((scene, sceneIndex) =>
    list(scene.shots).map((shot, shotIndex) =>
      inspectCreativeShotTemporalContract({
        shot,
        fps: Number(input.fps || 30),
        label:
          `scene ${sceneIndex + 1} shot ${shotIndex + 1}`,
      }).report,
    ),
  );

  const temporalFailures = reports.flatMap(
    (report) => list(report.failures),
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
      passed:
        temporalFailures.length === 0,
      failures: temporalFailures,
      shot_count: reports.length,
      total_frames: reports.reduce(
        (total, report) =>
          total +
          Number(report.total_frames || 0),
        0,
      ),
      timed_item_count: reports.reduce(
        (total, report) =>
          total +
          Number(
            report.timed_item_count || 0,
          ),
        0,
      ),
      reports,
    },
  };
}

function latestStoredAudit(job = {}) {
  const state = object(
    job.storyboard_audit,
  );

  return (
    list(state.history).at(-1) ||
    state.latest ||
    null
  );
}

function planAddressSignature(plan = {}) {
  return list(plan.scenes).map(
    (scene, sceneIndex) => ({
      scene_number: sceneIndex + 1,
      shot_numbers: list(scene.shots).map(
        (_, shotIndex) =>
          shotIndex + 1,
      ),
    }),
  );
}

function planDuration(plan = {}) {
  return list(plan.scenes).reduce(
    (total, scene) =>
      total +
      list(scene.shots).reduce(
        (shotTotal, shot) =>
          shotTotal +
          Number(
            shot.duration_seconds || 0,
          ),
        0,
      ),
    0,
  );
}

function referenceIds(plan = {}) {
  return unique(
    list(plan.scenes).flatMap((scene) =>
      list(scene.shots).flatMap(
        (shot) => [
          ...list(
            shot.reference_asset_ids,
          ),
          ...list(shot.assets),
          ...list(
            shot.master_still_contract
              ?.reference_asset_ids,
          ),
        ],
      ),
    ),
  ).sort();
}

function temporalAndMasterSignature(
  plan = {},
) {
  return JSON.stringify(
    list(plan.scenes).map(
      (scene, sceneIndex) => ({
        scene_number: sceneIndex + 1,
        shots: list(scene.shots).map(
          (shot, shotIndex) => ({
            shot_number: shotIndex + 1,
            master_still_contract:
              shot.master_still_contract,
            temporal_contract:
              shot.temporal_contract,
          }),
        ),
      }),
    ),
  );
}

function groupFailureDetails(
  audit,
  group,
) {
  return list(
    audit.storyboard.failure_details,
  ).filter((detail) =>
    detail.scope === group.scope &&
    Number(detail.scene_number || 0) ===
      Number(group.scene_number || 0) &&
    Number(detail.shot_number || 0) ===
      Number(group.shot_number || 0),
  );
}

function introducedFailures(
  before,
  after,
) {
  const previous = new Set(
    list(before.failures).map(String),
  );

  return list(after.failures)
    .map(String)
    .filter((failure) =>
      !previous.has(failure),
    );
}

function sceneAndShot(plan, group) {
  const scene = list(plan.scenes)[
    Number(group.scene_number) - 1
  ];

  const shot = list(scene?.shots)[
    Number(group.shot_number) - 1
  ];

  return {
    scene: scene || null,
    shot: shot || null,
  };
}

function repairOutputShape(group) {
  return {
    result: {
      scene_number:
        group.scene_number,
      shot_number:
        group.shot_number,
      camera_patch: {},
      lighting_patch: {},
      actor_patches: [
        {
          actor_number: 1,
          patch: {},
        },
      ],
      addressed_failures: [],
      evidence_mapping: [
        {
          failure: "",
          field: "",
          evidence_or_decision: "",
        },
      ],
      preserved_fields: [],
      decisions: [],
      risks: [],
    },
  };
}

function applyRepairResult({
  plan,
  group,
  result,
}) {
  const output = clone(plan);
  const sceneIndex =
    Number(group.scene_number) - 1;
  const shotIndex =
    Number(group.shot_number) - 1;

  const scene = object(
    output.scenes?.[sceneIndex],
  );
  const shot = object(
    scene.shots?.[shotIndex],
  );

  if (!Object.keys(scene).length) {
    throw new Error(
      "CREATIVE_FINAL_STORYBOARD_SCENE_NOT_FOUND",
    );
  }

  if (!Object.keys(shot).length) {
    throw new Error(
      "CREATIVE_FINAL_STORYBOARD_SHOT_NOT_FOUND",
    );
  }

  const cameraPatch = clone(
    object(result.camera_patch),
  );
  const lightingPatch = clone(
    object(result.lighting_patch),
  );

  const nextActors = clone(
    list(shot.actors),
  );

  for (
    const actorPatchValue
    of list(result.actor_patches)
  ) {
    const actorPatch = object(
      actorPatchValue,
    );
    const actorNumber = Number(
      actorPatch.actor_number,
    );

    if (
      !Number.isInteger(actorNumber) ||
      actorNumber <= 0 ||
      actorNumber > nextActors.length
    ) {
      throw new Error(
        "CREATIVE_FINAL_STORYBOARD_ACTOR_PATCH_ADDRESS_INVALID",
      );
    }

    nextActors[actorNumber - 1] =
      deepMerge(
        object(nextActors[actorNumber - 1]),
        object(actorPatch.patch),
      );
  }

  const nextShot = {
    ...shot,
    camera: deepMerge(
      object(shot.camera),
      cameraPatch,
    ),
    lighting: deepMerge(
      object(shot.lighting),
      lightingPatch,
    ),
    actors: nextActors,
  };

  for (const key of [
    "shot_number",
    "duration_seconds",
    "duration",
    "reference_asset_ids",
    "assets",
    "master_still_contract",
    "temporal_contract",
  ]) {
    nextShot[key] = clone(shot[key]);
  }

  output.scenes[sceneIndex]
    .shots[shotIndex] = nextShot;

  return output;
}

function validateCandidate({
  beforeAudit,
  afterAudit,
  currentPlan,
  candidatePlan,
  group,
}) {
  const reasons = [];

  if (
    JSON.stringify(
      planAddressSignature(currentPlan),
    ) !==
    JSON.stringify(
      planAddressSignature(candidatePlan),
    )
  ) {
    reasons.push(
      "SCENE_OR_SHOT_STRUCTURE_CHANGED",
    );
  }

  if (
    Math.abs(
      planDuration(currentPlan) -
      planDuration(candidatePlan),
    ) > 0.001
  ) {
    reasons.push("DURATION_CHANGED");
  }

  if (
    JSON.stringify(referenceIds(currentPlan)) !==
    JSON.stringify(referenceIds(candidatePlan))
  ) {
    reasons.push(
      "CANONICAL_REFERENCE_SET_CHANGED",
    );
  }

  if (
    temporalAndMasterSignature(currentPlan) !==
    temporalAndMasterSignature(candidatePlan)
  ) {
    reasons.push(
      "TEMPORAL_OR_MASTER_STILL_CHANGED",
    );
  }

  if (!afterAudit.temporal.passed) {
    reasons.push(
      "TEMPORAL_CONTRACT_REGRESSED",
    );
  }

  if (
    afterAudit.temporal.shot_count !==
    beforeAudit.temporal.shot_count
  ) {
    reasons.push(
      "TEMPORAL_SHOT_COUNT_CHANGED",
    );
  }

  if (
    afterAudit.temporal.total_frames !==
    beforeAudit.temporal.total_frames
  ) {
    reasons.push(
      "TEMPORAL_FRAME_COVERAGE_CHANGED",
    );
  }

  if (
    afterAudit.temporal.timed_item_count !==
    beforeAudit.temporal.timed_item_count
  ) {
    reasons.push(
      "TEMPORAL_TIMED_ITEMS_CHANGED",
    );
  }

  const introduced = introducedFailures(
    beforeAudit,
    afterAudit,
  );

  if (introduced.length) {
    reasons.push(
      "NEW_FAILURES_INTRODUCED",
    );
  }

  const beforeGroupCount =
    groupFailureDetails(
      beforeAudit,
      group,
    ).length;

  const afterGroupCount =
    groupFailureDetails(
      afterAudit,
      group,
    ).length;

  if (
    afterAudit.failure_count >=
    beforeAudit.failure_count
  ) {
    reasons.push(
      "TOTAL_FAILURE_COUNT_DID_NOT_IMPROVE",
    );
  }

  if (
    afterGroupCount >= beforeGroupCount
  ) {
    reasons.push(
      "ADDRESSED_GROUP_DID_NOT_IMPROVE",
    );
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    introduced_failures: introduced,
    before_failure_count:
      beforeAudit.failure_count,
    after_failure_count:
      afterAudit.failure_count,
    before_group_failure_count:
      beforeGroupCount,
    after_group_failure_count:
      afterGroupCount,
  };
}

async function runFocusedRepair({
  job,
  plan,
  audit,
  group,
  attempt,
}) {
  const { scene, shot } =
    sceneAndShot(plan, group);

  const exactFailures =
    groupFailureDetails(
      audit,
      group,
    );

  const execution = await reason({
    task: [
      `Repair only storyboard summary evidence for scene ${group.scene_number} shot ${group.shot_number}.`,
      "Address every supplied failure by adding only the missing explicit camera, lighting or actor-blocking fields.",
      "The existing temporal contract and master still are authoritative and immutable. Read them closely and materialize concise shot-level summaries that remain exactly consistent with them.",
      "Do not invent a new action, camera path, lighting event, actor identity, object, claim, location or reference.",
      "When the temporal contract contains the answer, summarize that accepted evidence into the requested canonical field.",
      "When a genuinely missing static summary decision is required, choose the smallest physically compatible decision that does not contradict any existing temporal state, keyframe, motivation, lock or acceptance criterion.",
      "Actor patches must target existing actors by actor_number and preserve all unaddressed actor fields.",
      "Return no complete scene, shot, plan, temporal contract, master still or asset list.",
      "Every returned field must trace to one exact supplied failure and must be concrete, measurable and independently executable.",
    ].join(" "),
    input: {
      organization_id:
        job.organization_id,
      creative_project_id:
        job.creative_project_id,
      creative_mission_id:
        job.creative_mission_id,
      objective:
        object(job.input_snapshot)
          .objective,
      brief:
        object(job.input_snapshot)
          .brief,
      scene_number:
        group.scene_number,
      shot_number:
        group.shot_number,
      repair_attempt: attempt,
      exact_failure_group: group,
      exact_failure_details:
        exactFailures,
      current_scene: scene,
      current_shot: shot,
      locked_master_still:
        shot?.master_still_contract,
      locked_temporal_contract:
        shot?.temporal_contract,
      canonical_assets:
        list(job.asset_snapshot),
    },
    constraints: {
      exactly_one_shot: true,
      exact_scene_number:
        group.scene_number,
      exact_shot_number:
        group.shot_number,
      only_camera_lighting_actor_summary_fields:
        true,
      preserve_structure: true,
      preserve_duration: true,
      preserve_references: true,
      preserve_master_still: true,
      preserve_temporal_contract: true,
      preserve_unaddressed_fields: true,
      no_complete_plan_replacement: true,
      no_new_creative_action: true,
      every_change_must_trace_to_failure:
        true,
      no_generic_filler: true,
    },
    outputShape:
      repairOutputShape(group),
    temperature:
      attempt === 1 ? 0.2 : 0.1,
    maxOutputTokens: 7000,
    timeoutMs: 240000,
    metadata: {
      creative_director_job_id:
        job.id,
      creative_director_step_key:
        REPAIR_STEP,
      storyboard_repair_scope:
        group.key,
      storyboard_repair_attempt:
        attempt,
      storyboard_repair_version:
        "final-evidence-gap-v1",
    },
  });

  if (
    execution.fallback ||
    execution.recovery
  ) {
    const error = new Error(
      "CREATIVE_FINAL_STORYBOARD_FOCUSED_REASONING_FAILED",
    );
    error.code =
      "CREATIVE_FINAL_STORYBOARD_FOCUSED_REASONING_FAILED";
    error.details = {
      group,
      attempt,
      fallback_reason:
        execution.fallback_reason,
    };
    throw error;
  }

  return {
    execution,
    result: object(execution.result),
  };
}

async function getJob(
  jobId,
  organizationId,
) {
  const { data, error } = await supabaseAdmin
    .from(JOBS)
    .select("*")
    .eq("id", jobId)
    .eq(
      "organization_id",
      organizationId,
    )
    .single();

  if (error) throw error;
  return data;
}

async function getStep(
  jobId,
  key,
) {
  const { data, error } = await supabaseAdmin
    .from(STEPS)
    .select("*")
    .eq("job_id", jobId)
    .eq("step_key", key)
    .single();

  if (error) throw error;
  return data;
}

async function persistProgress({
  job,
  plan,
  convergence,
}) {
  const pipeline = object(
    job.pipeline_result,
  );

  const { error } = await supabaseAdmin
    .from(JOBS)
    .update({
      current_plan: plan,
      pipeline_result: {
        ...pipeline,
        final_storyboard_convergence:
          convergence,
      },
      updated_at: now(),
    })
    .eq("id", job.id)
    .eq(
      "organization_id",
      job.organization_id,
    );

  if (error) throw error;
}

async function progressValues(jobId) {
  const { data, error } = await supabaseAdmin
    .from(STEPS)
    .select("status")
    .eq("job_id", jobId);

  if (error) throw error;

  const steps = data || [];
  const completed = steps.filter(
    (step) => [
      "COMPLETED",
      "SKIPPED",
    ].includes(step.status),
  ).length;

  return {
    completed_steps: completed,
    progress_percent:
      steps.length
        ? Math.round(
            completed /
            steps.length *
            10000,
          ) / 100
        : 0,
  };
}

async function completeRepair({
  job,
  step,
  plan,
  audit,
  convergence,
}) {
  const completedAt = now();
  const providers = convergence.executions
    .map((item) => item.provider)
    .filter(Boolean);
  const models = convergence.executions
    .map((item) => item.model)
    .filter(Boolean);
  const confidences = convergence.executions
    .map((item) =>
      Number(item.confidence || 0),
    );

  const { error: stepError } =
    await supabaseAdmin
      .from(STEPS)
      .update({
        status: "COMPLETED",
        provider:
          providers[0] || null,
        model:
          models[0] || null,
        confidence:
          confidences.length
            ? confidences.reduce(
                (total, value) =>
                  total + value,
                0,
              ) / confidences.length
            : null,
        duration_ms:
          convergence.duration_ms,
        metrics: {
          ...object(step.metrics),
          kind: "REPAIR",
          convergence_version:
            "final-evidence-gap-v1",
          stored_failure_count:
            convergence.stored_failure_count,
          initial_failure_count:
            convergence.initial_failure_count,
          final_failure_count:
            audit.failure_count,
          failures_removed:
            convergence.stored_failure_count -
            audit.failure_count,
          accepted_groups:
            convergence.accepted.length,
          rejected_attempts:
            convergence.rejected.length,
          reasoning_executions:
            convergence.executions.length,
          temporal_preserved:
            audit.temporal.passed,
          temporal_shot_count:
            audit.temporal.shot_count,
          total_frames:
            audit.temporal.total_frames,
          timed_item_count:
            audit.temporal.timed_item_count,
        },
        error: null,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", step.id);

  if (stepError) throw stepError;

  const nextStep = await getStep(
    job.id,
    NEXT_STEP,
  );

  const progress = await progressValues(
    job.id,
  );

  const pipeline = object(
    job.pipeline_result,
  );

  const { data, error: jobError } =
    await supabaseAdmin
      .from(JOBS)
      .update({
        current_plan: plan,
        status: "WAITING",
        current_step_key:
          NEXT_STEP,
        current_step_index:
          nextStep.step_index,
        error: null,
        lease_token: null,
        lease_expires_at: null,
        completed_at: null,
        ...progress,
        pipeline_result: {
          ...pipeline,
          final_storyboard_convergence:
            convergence,
        },
        updated_at: completedAt,
      })
      .eq("id", job.id)
      .eq(
        "organization_id",
        job.organization_id,
      )
      .select("*")
      .single();

  if (jobError) throw jobError;
  return data;
}

function safeResponse({
  success,
  status = 200,
  error = null,
  details = null,
  audit = null,
  convergence = null,
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
    convergence,
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
    code.includes("CONVERGENCE") ||
    code.includes("REPAIR")
  ) {
    return 422;
  }

  return 500;
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

    if (!jobId) {
      return safeResponse({
        success: false,
        status: 400,
        error: "job_id required",
      });
    }

    let job = await getJob(
      jobId,
      organizationId,
    );

    const step = await getStep(
      jobId,
      REPAIR_STEP,
    );

    if (
      !["FAILED", "WAITING"].includes(
        step.status,
      )
    ) {
      return safeResponse({
        success: false,
        status: 409,
        error:
          "CREATIVE_FINAL_STORYBOARD_REPAIR_STEP_NOT_AVAILABLE",
        details: {
          step_status: step.status,
          step_attempt: step.attempt,
        },
      });
    }

    const storedAudit =
      latestStoredAudit(job);

    const storedFailureCount = Number(
      storedAudit?.failure_count ??
      step.error?.details?.before
        ?.failure_count ??
      step.error?.details
        ?.previous_failure_count ??
      0,
    );

    const input = object(
      job.input_snapshot,
    );
    const assets = list(
      job.asset_snapshot,
    );

    let plan =
      normalizeCreativeStoryboardPlan(
        object(job.current_plan),
      );

    let audit = inspectPlan({
      plan,
      input,
      assets,
    });

    plan = audit.plan;

    const convergence = {
      version:
        "final-evidence-gap-v1",
      started_at: now(),
      repair_step: REPAIR_STEP,
      next_step: NEXT_STEP,
      stored_failure_count:
        storedFailureCount,
      initial_failure_count:
        audit.failure_count,
      initial_storyboard_failure_count:
        audit.storyboard.failures.length,
      temporal_baseline: {
        passed:
          audit.temporal.passed,
        shot_count:
          audit.temporal.shot_count,
        total_frames:
          audit.temporal.total_frames,
        timed_item_count:
          audit.temporal.timed_item_count,
      },
      accepted: [],
      rejected: [],
      executions: [],
    };

    if (!audit.temporal.passed) {
      return safeResponse({
        success: false,
        status: 422,
        error:
          "CREATIVE_FINAL_STORYBOARD_REQUIRES_VALID_TEMPORAL_BASELINE",
        audit,
        convergence,
      });
    }

    if (
      audit.temporal.shot_count !== 6 ||
      audit.temporal.total_frames !== 900
    ) {
      return safeResponse({
        success: false,
        status: 422,
        error:
          "CREATIVE_FINAL_STORYBOARD_TEMPORAL_COVERAGE_UNEXPECTED",
        details: {
          expected_shot_count: 6,
          received_shot_count:
            audit.temporal.shot_count,
          expected_total_frames: 900,
          received_total_frames:
            audit.temporal.total_frames,
        },
        audit,
        convergence,
      });
    }

    await persistProgress({
      job,
      plan,
      convergence: {
        ...convergence,
        phase:
          "NORMALIZED_BASELINE_PERSISTED",
        updated_at: now(),
      },
    });

    job = await getJob(
      jobId,
      organizationId,
    );

    for (
      let groupIndex = 0;
      groupIndex < MAX_GROUPS;
      groupIndex += 1
    ) {
      if (audit.passed) break;

      const groups = list(
        audit.storyboard.failure_groups,
      );

      if (!groups.length) break;

      const group = groups[0];

      if (group.scope !== "SHOT") {
        convergence.stopped_on_group =
          group;
        convergence.stop_reason =
          "NON_SHOT_FAILURE_REQUIRES_REVIEW";
        break;
      }

      let accepted = false;

      for (
        let attempt = 1;
        attempt <= MAX_ATTEMPTS_PER_GROUP;
        attempt += 1
      ) {
        const repair =
          await runFocusedRepair({
            job,
            plan,
            audit,
            group,
            attempt,
          });

        convergence.executions.push({
          group: group.key,
          attempt,
          provider:
            repair.execution.provider ||
            null,
          model:
            repair.execution.model ||
            null,
          confidence: Number(
            repair.execution.confidence ||
            0,
          ),
        });

        const candidatePlan =
          applyRepairResult({
            plan,
            group,
            result: repair.result,
          });

        const candidateAudit = inspectPlan({
          plan: candidatePlan,
          input,
          assets,
        });

        const validation =
          validateCandidate({
            beforeAudit: audit,
            afterAudit:
              candidateAudit,
            currentPlan: plan,
            candidatePlan,
            group,
          });

        if (!validation.accepted) {
          convergence.rejected.push({
            group: group.key,
            attempt,
            validation,
            addressed_failures:
              list(
                repair.result
                  .addressed_failures,
              ),
            evidence_mapping:
              list(
                repair.result
                  .evidence_mapping,
              ),
          });
          continue;
        }

        plan = candidateAudit.plan;
        audit = candidateAudit;
        accepted = true;

        convergence.accepted.push({
          group: group.key,
          scene_number:
            group.scene_number,
          shot_number:
            group.shot_number,
          owners: group.owners,
          attempt,
          validation,
          addressed_failures:
            list(
              repair.result
                .addressed_failures,
            ),
          evidence_mapping:
            list(
              repair.result
                .evidence_mapping,
            ),
          accepted_at: now(),
        });

        convergence.current_failure_count =
          audit.failure_count;

        await persistProgress({
          job,
          plan,
          convergence: {
            ...convergence,
            phase:
              "SHOT_GROUP_ACCEPTED",
            updated_at: now(),
          },
        });

        job = await getJob(
          jobId,
          organizationId,
        );

        break;
      }

      if (!accepted) {
        convergence.stopped_on_group =
          group;
        convergence.stop_reason =
          "SHOT_GROUP_DID_NOT_PRODUCE_MEASURABLE_IMPROVEMENT";
        break;
      }
    }

    audit = inspectPlan({
      plan,
      input,
      assets,
    });

    convergence.completed_at = now();
    convergence.duration_ms =
      Date.now() - startedAt;
    convergence.final_failure_count =
      audit.failure_count;
    convergence.final_storyboard_failure_count =
      audit.storyboard.failures.length;
    convergence.temporal_preserved =
      audit.temporal.passed;
    convergence.temporal_shot_count =
      audit.temporal.shot_count;
    convergence.total_frames =
      audit.temporal.total_frames;
    convergence.timed_item_count =
      audit.temporal.timed_item_count;
    convergence.passed = audit.passed;

    if (!audit.passed) {
      await persistProgress({
        job,
        plan: audit.plan,
        convergence,
      });

      return safeResponse({
        success: false,
        status: 422,
        error:
          "CREATIVE_FINAL_STORYBOARD_CONVERGENCE_INCOMPLETE",
        details: {
          stop_reason:
            convergence.stop_reason ||
            null,
          stopped_on_group:
            convergence.stopped_on_group ||
            null,
          remaining_failure_count:
            audit.failure_count,
          remaining_failures:
            audit.failures,
        },
        audit,
        convergence,
      });
    }

    const completedJob =
      await completeRepair({
        job,
        step,
        plan: audit.plan,
        audit,
        convergence,
      });

    return safeResponse({
      success: true,
      audit,
      convergence,
      job: completedJob,
    });
  } catch (error) {
    return safeResponse({
      success: false,
      status: errorStatus(error),
      error:
        error.message ||
        "CREATIVE_FINAL_STORYBOARD_CONVERGENCE_FAILED",
      details: {
        code: error.code || null,
        runtime_details:
          error.details || null,
        cause:
          error.cause?.message ||
          null,
      },
    });
  }
}
