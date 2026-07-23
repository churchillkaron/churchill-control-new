import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  ExecutionRuntime,
} from "@/lib/creative/execution/runtime/ExecutionRuntime";

import {
  CreativeProductionControlRuntime,
} from "@/lib/creative/production/control/CreativeProductionControlRuntime";

import {
  CreativeMasterStillPilotRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  buildProductionTaskIdentityMap,
  resolveProductionTaskDependencies,
} from "@/lib/operations/tasks/identity/ProductionTaskIdentity";

import {
  resolveOrganizationCurrency,
} from "@/lib/platform/context/resolveOrganizationCurrency";

const RUNTIME_VERSION =
  "CREATIVE_AUTHORIZED_MASTER_STILL_GENERATION_V1";
const AUTHORIZATION_VERSION =
  "CREATIVE_MASTER_STILL_PROOF_AUTHORIZATION_V2";
const PREPARATION_VERSION =
  "CREATIVE_AUTHORIZED_MASTER_STILL_PREPARATION_V1";
const CONFIRMATION_TOKEN =
  "GENERATE_AUTHORIZED_MASTER_STILL_PROOF";
const MASTER_STILL = "MASTER_STILL";
const MASTER_STILL_QA = "MASTER_STILL_QA";
const TERMINAL_FAILURE = new Set(["FAILED", "CANCELLED", "CANCELED"]);

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function runtimeError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function deliverable(step = {}) {
  return String(
    step.metadata?.deliverable ||
    step.intent?.deliverable ||
    "",
  ).toUpperCase();
}

function service(step = {}) {
  return String(
    step.service_code ||
    step.service ||
    step.generation?.service ||
    "",
  ).toLowerCase();
}

function specification(step = {}) {
  const input = object(step.input);
  const requirements = object(input.requirements);

  return (
    input.specification ||
    requirements.specification ||
    requirements.shot_specification ||
    step.requirements?.specification ||
    step.generation?.input?.specification ||
    {}
  );
}

function sceneNumber(step = {}) {
  return Number(
    specification(step).scene?.number ||
    step.metadata?.scene_number ||
    0,
  );
}

function shotNumber(step = {}) {
  return Number(
    specification(step).shot?.number ||
    step.metadata?.shot_number ||
    0,
  );
}

function findPair(plan = {}, requestedScene, requestedShot) {
  const steps = list(plan.steps);

  if (steps.length !== 2) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_GENERATION_PLAN_STEP_COUNT_INVALID",
      { expected: 2, actual: steps.length },
    );
  }
  if (steps.some((step) => service(step).includes("video"))) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_GENERATION_VIDEO_STEP_FORBIDDEN",
    );
  }

  const master = steps.find((step) =>
    deliverable(step) === MASTER_STILL &&
    sceneNumber(step) === Number(requestedScene) &&
    shotNumber(step) === Number(requestedShot),
  );
  const qa = steps.find((step) =>
    deliverable(step) === MASTER_STILL_QA &&
    (
      step.metadata?.inspected_node_id === master?.node_id ||
      step.input?.inspected_node_id === master?.node_id ||
      list(step.depends_on).includes(master?.id)
    ),
  );

  if (!master || !qa) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_GENERATION_PLAN_PAIR_REQUIRED",
    );
  }
  if (service(master) !== "ai.image.generate") {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_GENERATION_MASTER_SERVICE_INVALID",
    );
  }
  if (service(qa) !== "ai.image.analyze") {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_GENERATION_QA_SERVICE_INVALID",
    );
  }

  return { master, qa };
}

function validateInputs({
  organization_id,
  creative_project_id,
  approval_candidate,
  proof_authorization,
  authorized_preparation,
  explicit_confirmation,
  accept_paid_execution,
}) {
  const candidate = object(approval_candidate);
  const authorization = object(proof_authorization);
  const preparation = object(authorized_preparation);
  const proofShot = object(authorization.proof_shot);
  const preparedShot = object(preparation.proof_shot);
  const scope = object(authorization.authorization_scope);
  const preparedPlan = object(
    preparation.preparation?.execution_plan,
  );

  if (accept_paid_execution !== true) {
    throw runtimeError(
      "CREATIVE_PAID_EXECUTION_ACCEPTANCE_REQUIRED",
    );
  }
  if (text(explicit_confirmation) !== CONFIRMATION_TOKEN) {
    throw runtimeError(
      "CREATIVE_MASTER_STILL_EXPLICIT_CONFIRMATION_REQUIRED",
      { required_confirmation: CONFIRMATION_TOKEN },
    );
  }
  if (candidate.success !== true) {
    throw runtimeError("CREATIVE_APPROVAL_CANDIDATE_REQUIRED");
  }
  if (
    authorization.success !== true ||
    authorization.authorization_version !== AUTHORIZATION_VERSION
  ) {
    throw runtimeError(
      "CREATIVE_PROOF_AUTHORIZATION_REQUIRED",
    );
  }
  if (
    preparation.success !== true ||
    preparation.preparation_version !== PREPARATION_VERSION ||
    preparation.preparation_only !== true
  ) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_PREPARATION_REQUIRED",
    );
  }

  for (const value of [candidate, authorization, preparation]) {
    if (
      String(value.organization_id || "") !==
      String(organization_id || "")
    ) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_ORGANIZATION_MISMATCH",
      );
    }
    if (
      String(value.creative_project_id || "") !==
      String(creative_project_id || "")
    ) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_PROJECT_MISMATCH",
      );
    }
  }

  const hashFields = [
    "approval_candidate_hash",
    "canonical_story_hash",
  ];

  for (const field of hashFields) {
    if (
      text(preparation[field]) !== text(authorization[field])
    ) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_STORY_BINDING_MISMATCH",
        { field },
      );
    }
  }
  if (
    text(preparation.proof_authorization_hash) !==
    text(authorization.authorization_hash)
  ) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_GENERATION_AUTHORIZATION_HASH_MISMATCH",
    );
  }

  const shotFields = [
    "key",
    "scene_number",
    "shot_number",
    "shot_hash",
  ];

  for (const field of shotFields) {
    if (String(preparedShot[field]) !== String(proofShot[field])) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_SHOT_BINDING_MISMATCH",
        { field },
      );
    }
  }

  const requiredScope = {
    image_generation_limit: 1,
    image_qa_required: true,
    automatic_repair_limit: 1,
    repair_qa_required: true,
    video_generation_allowed: false,
    motion_generation_allowed: false,
    full_pipeline_allowed: false,
    additional_shots_allowed: false,
    provider_retry_without_review_allowed: false,
  };

  for (const [field, expected] of Object.entries(requiredScope)) {
    if (scope[field] !== expected) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_SCOPE_INVALID",
        { field, expected, actual: scope[field] },
      );
    }
  }

  if (!preparedPlan.id) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_GENERATION_EXECUTION_PLAN_REQUIRED",
    );
  }
  if (
    preparation.production_dispatched === true ||
    preparation.image_generation_dispatched === true ||
    preparation.video_generation_dispatched === true
  ) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_PREPARATION_MUST_BE_UNDISPATCHED",
    );
  }

  return {
    candidate,
    authorization,
    preparation,
    proofShot,
    scope,
    execution_plan_id: preparedPlan.id,
  };
}

function taskType(step = {}) {
  if (deliverable(step) === MASTER_STILL) return "GENERATE_IMAGE";
  if (deliverable(step) === MASTER_STILL_QA) return "QUALITY_REVIEW";
  throw runtimeError(
    "CREATIVE_AUTHORIZED_GENERATION_TASK_TYPE_INVALID",
  );
}

async function materializeAuthorizedTask({
  step,
  plan,
  organization_id,
  creative_project_id,
  currency,
  identityMap,
  selectedStepIds,
  executionAllowed,
  authorization,
  proofShot,
}) {
  const id = identityMap.get(step.id);
  const scope = { organization_id, creative_project_id };
  const existing = await ProductionTaskRuntime.get(id, scope);

  if (existing) {
    if (
      text(existing.metadata?.proof_authorization_hash) !==
        text(authorization.authorization_hash) ||
      text(existing.metadata?.authorized_shot_hash) !==
        text(proofShot.shot_hash) ||
      text(existing.metadata?.execution_plan_id) !== text(plan.id)
    ) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_EXISTING_TASK_BINDING_MISMATCH",
        { task_id: id },
      );
    }
    if (TERMINAL_FAILURE.has(String(existing.status || "").toUpperCase())) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_PREVIOUS_ATTEMPT_FAILED",
        {
          task_id: id,
          status: existing.status,
          error: existing.error || null,
        },
      );
    }

    return existing;
  }

  return ProductionTaskRuntime.create({
    id,
    organization_id,
    creative_project_id,
    production_graph_id: plan.production_graph_id,
    scene_id: step.metadata?.scene_id || null,
    shot_id: step.metadata?.shot_id || null,
    type: taskType(step),
    status: "WAITING",
    title:
      step.metadata?.node_title ||
      step.input?.title ||
      `${deliverable(step)} Authorized Proof Task`,
    description: step.input?.description || "",
    service_id: step.service_code || step.service,
    service_code: step.service_code || step.service,
    capability: step.capability || null,
    priority: Number(step.priority || 100),
    depends_on: resolveProductionTaskDependencies(
      list(step.depends_on).filter((dependencyStepId) =>
        selectedStepIds.has(dependencyStepId),
      ),
      identityMap,
    ),
    input: step.input || {},
    cost: {
      currency,
      estimated: Number(step.estimated_cost || 0),
      actual: 0,
      approved: executionAllowed === true,
    },
    timing: {
      estimated_seconds: Number(step.estimated_seconds || 0),
      started_at: null,
      completed_at: null,
    },
    review: {
      required: true,
      approved: false,
      approved_by: null,
      notes: "",
    },
    metadata: {
      ...(step.metadata || {}),
      execution_plan_id: plan.id,
      execution_step_id: step.id,
      node_id: step.node_id,
      idempotency_key: step.id,
      production_contract:
        plan.metadata?.production_contract ||
        "atomic_reference_grounded_shots_v1",
      pilot_scope: "SINGLE_AUTHORIZED_MASTER_STILL_WITH_QA",
      video_execution_forbidden: true,
      max_attempts: 1,
      attempt: 0,
      proof_authorization_version:
        authorization.authorization_version,
      proof_authorization_hash:
        authorization.authorization_hash,
      approval_candidate_hash:
        authorization.approval_candidate_hash,
      canonical_story_hash:
        authorization.canonical_story_hash,
      authorized_proof_shot_key: proofShot.key,
      authorized_shot_hash: proofShot.shot_hash,
      authorized_reference_asset_ids:
        list(proofShot.reference_asset_ids).map(String),
      paid_execution_explicitly_confirmed: true,
      automatic_repair_dispatched: false,
    },
  });
}

function summarizeTask(task = {}) {
  return {
    id: task.id || null,
    status: task.status || null,
    provider: task.metadata?.provider || null,
    provider_status: task.metadata?.provider_status || null,
    attempt: Number(task.metadata?.attempt || 0),
    max_attempts: Number(task.metadata?.max_attempts || 0),
    actual_cost: Number(task.cost?.actual || 0),
    currency: task.cost?.currency || null,
    error: task.error || null,
  };
}

export const CreativeAuthorizedMasterStillGenerationRuntime = {
  async run({
    organization_id,
    creative_project_id,
    approval_candidate,
    proof_authorization,
    authorized_preparation,
    explicit_confirmation,
    accept_paid_execution = false,
  } = {}) {
    if (!organization_id) {
      throw runtimeError("organization_id required");
    }
    if (!creative_project_id) {
      throw runtimeError("creative_project_id required");
    }

    const validated = validateInputs({
      organization_id,
      creative_project_id,
      approval_candidate,
      proof_authorization,
      authorized_preparation,
      explicit_confirmation,
      accept_paid_execution,
    });
    const [project, plans, control, currency] = await Promise.all([
      CreativeProjectRuntime.get(creative_project_id),
      ExecutionRuntime.list({
        organization_id,
        creative_project_id,
      }),
      CreativeProductionControlRuntime.assertExecutionAllowed({
        organization_id,
        creative_project_id,
      }),
      resolveOrganizationCurrency({ organization_id }),
    ]);

    if (
      !project ||
      String(project.organization_id || "") !== String(organization_id)
    ) {
      throw runtimeError("CREATIVE_PROJECT_NOT_IN_ORGANIZATION");
    }

    const checkpoint = object(
      project.metadata?.master_still_pilot_checkpoint,
    );
    const checkpointAuthorization = object(
      checkpoint.proof_authorization,
    );

    if (
      text(checkpointAuthorization.authorization_hash) !==
        text(validated.authorization.authorization_hash) ||
      text(checkpointAuthorization.shot_hash) !==
        text(validated.proofShot.shot_hash)
    ) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_CHECKPOINT_BINDING_MISMATCH",
      );
    }

    const plan = plans.find((item) =>
      text(item.id) === text(validated.execution_plan_id),
    );

    if (!plan) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_PLAN_NOT_FOUND",
      );
    }
    if (text(plans[0]?.id) !== text(plan.id)) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_PLAN_NOT_LATEST",
        {
          authorized_plan_id: plan.id,
          latest_plan_id: plans[0]?.id || null,
        },
      );
    }

    const pair = findPair(
      plan,
      validated.proofShot.scene_number,
      validated.proofShot.shot_number,
    );
    const identityMap = buildProductionTaskIdentityMap({
      organization_id,
      creative_project_id,
      execution_plan_id: plan.id,
      steps: plan.steps || [],
    });
    const selectedStepIds = new Set([
      pair.master.id,
      pair.qa.id,
    ]);
    const executionAllowed =
      control.budget?.execution_allowed === true;

    if (!executionAllowed) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_BUDGET_NOT_APPROVED",
      );
    }

    const [masterBefore, qaBefore] = await Promise.all([
      materializeAuthorizedTask({
        step: pair.master,
        plan,
        organization_id,
        creative_project_id,
        currency,
        identityMap,
        selectedStepIds,
        executionAllowed,
        authorization: validated.authorization,
        proofShot: validated.proofShot,
      }),
      materializeAuthorizedTask({
        step: pair.qa,
        plan,
        organization_id,
        creative_project_id,
        currency,
        identityMap,
        selectedStepIds,
        executionAllowed,
        authorization: validated.authorization,
        proofShot: validated.proofShot,
      }),
    ]);

    await CreativeProjectRuntime.update(creative_project_id, {
      metadata: {
        ...(project.metadata || {}),
        authorized_master_still_execution: {
          version: RUNTIME_VERSION,
          proof_authorization_hash:
            validated.authorization.authorization_hash,
          execution_plan_id: plan.id,
          master_task_id: masterBefore.id,
          qa_task_id: qaBefore.id,
          proof_shot_key: validated.proofShot.key,
          explicit_confirmation: CONFIRMATION_TOKEN,
          accept_paid_execution: true,
          max_master_attempts: 1,
          automatic_repair_dispatched: false,
          authorized_at: new Date().toISOString(),
        },
      },
    });

    const execution = await CreativeMasterStillPilotRuntime.run({
      organization_id,
      creative_project_id,
      scene_number: validated.proofShot.scene_number,
      shot_number: validated.proofShot.shot_number,
      retry_preflight_blocked: false,
    });

    if (text(execution.execution_plan_id) !== text(plan.id)) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_EXECUTED_WRONG_PLAN",
        {
          authorized_plan_id: plan.id,
          executed_plan_id: execution.execution_plan_id || null,
        },
      );
    }
    if (
      Number(execution.selected_shot?.scene_number) !==
        Number(validated.proofShot.scene_number) ||
      Number(execution.selected_shot?.shot_number) !==
        Number(validated.proofShot.shot_number)
    ) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_EXECUTED_WRONG_SHOT",
      );
    }
    if (
      execution.video_tasks_materialized !== 0 ||
      execution.video_tasks_dispatched !== 0
    ) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_VIDEO_DISPATCH_FORBIDDEN",
      );
    }

    const scope = { organization_id, creative_project_id };
    const [masterAfter, qaAfter] = await Promise.all([
      ProductionTaskRuntime.get(masterBefore.id, scope),
      ProductionTaskRuntime.get(qaBefore.id, scope),
    ]);

    for (const task of [masterAfter, qaAfter]) {
      if (
        text(task?.metadata?.proof_authorization_hash) !==
          text(validated.authorization.authorization_hash) ||
        Number(task?.metadata?.max_attempts || 0) !== 1
      ) {
        throw runtimeError(
          "CREATIVE_AUTHORIZED_GENERATION_TASK_LOCK_MISSING",
          { task_id: task?.id || null },
        );
      }
    }

    const qualityFailed =
      String(qaAfter?.status || "").toUpperCase() === "FAILED";
    const masterFailed =
      String(masterAfter?.status || "").toUpperCase() === "FAILED";
    const passed = execution.success === true;
    const nextGate = passed
      ? "MASTER_STILL_PROOF_HUMAN_REVIEW_REQUIRED"
      : qualityFailed
        ? "MASTER_STILL_PROOF_QA_FAILED_REPAIR_REQUIRES_EXPLICIT_CONFIRMATION"
        : masterFailed
          ? "MASTER_STILL_PROOF_GENERATION_FAILED_MANUAL_REVIEW_REQUIRED"
          : execution.next_gate || "MASTER_STILL_PROOF_PROCESSING";

    return {
      success: passed,
      execution_accepted: true,
      generation_version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      approval_candidate_hash:
        validated.authorization.approval_candidate_hash,
      canonical_story_hash:
        validated.authorization.canonical_story_hash,
      proof_authorization_hash:
        validated.authorization.authorization_hash,
      execution_plan_id: plan.id,
      proof_shot: validated.proofShot,
      master_still: {
        ...execution.master_still,
        authorization: summarizeTask(masterAfter),
      },
      quality_review: {
        ...execution.quality_review,
        authorization: summarizeTask(qaAfter),
      },
      preflight: execution.preflight,
      paid_execution_explicitly_confirmed: true,
      image_generation_limit: 1,
      master_attempt_limit: 1,
      automatic_repair_limit:
        Number(validated.scope.automatic_repair_limit),
      automatic_repair_dispatched: false,
      provider_retry_without_review_allowed: false,
      video_generation_allowed: false,
      video_tasks_materialized: 0,
      video_tasks_dispatched: 0,
      next_gate: nextGate,
    };
  },
};
