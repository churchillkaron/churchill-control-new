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
  CreativeMaskedPilotPreparationRuntime,
} from "@/lib/creative/production/pilot/CreativeMaskedPilotPreparationRuntime";

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
  "CREATIVE_AUTHORIZED_FULL_SCENE_MASTER_STILL_V1";
const AUTHORIZATION_VERSION =
  "CREATIVE_MASTER_STILL_PROOF_AUTHORIZATION_V2";
const PREPARATION_VERSION =
  "CREATIVE_AUTHORIZED_MASTER_STILL_PREPARATION_V1";
const CONFIRMATION_TOKEN =
  "GENERATE_AUTHORIZED_MASTER_STILL_PROOF";
const FULL_SCENE_MODE =
  "FULL_SCENE_REFERENCE_SYNTHESIS";
const MASTER_STILL = "MASTER_STILL";
const MASTER_STILL_QA = "MASTER_STILL_QA";
const TERMINAL_FAILURE = new Set([
  "FAILED",
  "CANCELLED",
  "CANCELED",
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

function hasOutput(task = {}) {
  return Boolean(
    task.output?.image_url ||
    task.output?.url ||
    task.output?.asset_id ||
    task.output?.asset?.url ||
    task.output?.result,
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

function validateBundle({
  organization_id,
  creative_project_id,
  approval_candidate,
  proof_authorization,
  authorized_preparation,
  require_paid_confirmation = false,
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

  if (require_paid_confirmation) {
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
  }

  if (candidate.success !== true) {
    throw runtimeError("CREATIVE_APPROVAL_CANDIDATE_REQUIRED");
  }
  if (
    authorization.success !== true ||
    authorization.authorization_version !== AUTHORIZATION_VERSION
  ) {
    throw runtimeError("CREATIVE_PROOF_AUTHORIZATION_REQUIRED");
  }
  if (
    preparation.success !== true ||
    preparation.preparation_version !== PREPARATION_VERSION ||
    preparation.preparation_only !== true
  ) {
    throw runtimeError("CREATIVE_AUTHORIZED_PREPARATION_REQUIRED");
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

  for (const field of [
    "approval_candidate_hash",
    "canonical_story_hash",
  ]) {
    if (text(preparation[field]) !== text(authorization[field])) {
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

  for (const field of [
    "key",
    "scene_number",
    "shot_number",
    "shot_hash",
  ]) {
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
  if (deliverable(step) === MASTER_STILL) {
    return "GENERATE_IMAGE";
  }
  if (deliverable(step) === MASTER_STILL_QA) {
    return "QUALITY_REVIEW";
  }
  throw runtimeError(
    "CREATIVE_AUTHORIZED_GENERATION_TASK_TYPE_INVALID",
  );
}

function assertExistingTaskSafe({
  task,
  plan,
  authorization,
  proofShot,
}) {
  if (
    text(task.metadata?.proof_authorization_hash) !==
      text(authorization.authorization_hash) ||
    text(task.metadata?.authorized_shot_hash) !==
      text(proofShot.shot_hash) ||
    text(task.metadata?.execution_plan_id) !== text(plan.id)
  ) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_GENERATION_EXISTING_TASK_BINDING_MISMATCH",
      { task_id: task.id },
    );
  }

  const reasons = [];
  if (TERMINAL_FAILURE.has(String(task.status || "").toUpperCase())) {
    reasons.push(`TASK_STATUS_${String(task.status).toUpperCase()}`);
  }
  if (hasOutput(task)) reasons.push("TASK_ALREADY_HAS_OUTPUT");
  if (Number(task.cost?.actual || 0) > 0) {
    reasons.push("TASK_ALREADY_HAS_ACTUAL_COST");
  }
  if (task.metadata?.provider_job_id) {
    reasons.push("TASK_ALREADY_HAS_PROVIDER_JOB");
  }
  if (task.metadata?.provider_dispatched === true) {
    reasons.push("TASK_ALREADY_DISPATCHED");
  }
  if (task.metadata?.usage_created === true) {
    reasons.push("TASK_ALREADY_HAS_USAGE");
  }
  if (task.metadata?.wallet_reserved === true) {
    reasons.push("TASK_ALREADY_HAS_WALLET_RESERVATION");
  }

  if (reasons.length) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_FULL_SCENE_TASK_NOT_REUSABLE",
      { task_id: task.id, reasons },
    );
  }
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
    assertExistingTaskSafe({
      task: existing,
      plan,
      authorization,
      proofShot,
    });
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
      `${deliverable(step)} Authorized Full-Scene Proof Task`,
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
      pilot_scope:
        "SINGLE_AUTHORIZED_FULL_SCENE_MASTER_STILL_WITH_QA",
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
      paid_execution_explicitly_confirmed: false,
      automatic_repair_dispatched: false,
      provider_dispatched: false,
      usage_created: false,
      wallet_reserved: false,
      wallet_charged: false,
    },
  });
}

function assertPreparedTask(task = {}, bindingHash) {
  const mode = String(
    task.input?.composition_plan?.mode ||
    task.input?.specification?.shot?.composition_plan?.mode ||
    "",
  ).toUpperCase();
  const taskBindingHash = text(
    task.metadata?.evidence_binding_hash ||
    task.input?.evidence_binding_hash ||
    task.input?.specification?.approved_evidence_binding_hash,
  );
  const reasons = [];

  if (mode !== FULL_SCENE_MODE) {
    reasons.push("FULL_SCENE_MODE_MISSING");
  }
  if (!bindingHash || taskBindingHash !== text(bindingHash)) {
    reasons.push("EVIDENCE_BINDING_HASH_MISMATCH");
  }
  if (task.metadata?.full_scene_synthesis_prepared !== true) {
    reasons.push("FULL_SCENE_PREPARATION_FLAG_MISSING");
  }
  if (task.metadata?.masked_composition_prepared === true) {
    reasons.push("MASKED_COMPOSITION_MUST_BE_FALSE");
  }
  if (task.metadata?.provider_dispatched === true) {
    reasons.push("PROVIDER_ALREADY_DISPATCHED");
  }
  if (task.metadata?.usage_created === true) {
    reasons.push("USAGE_ALREADY_CREATED");
  }
  if (task.metadata?.wallet_reserved === true) {
    reasons.push("WALLET_ALREADY_RESERVED");
  }
  if (hasOutput(task) || Number(task.cost?.actual || 0) > 0) {
    reasons.push("PREPARED_TASK_ALREADY_SPENT");
  }

  if (reasons.length) {
    throw runtimeError(
      "CREATIVE_AUTHORIZED_FULL_SCENE_TASK_PREPARATION_INVALID",
      { task_id: task.id, reasons },
    );
  }
}

function summarizeTask(task = {}) {
  return {
    id: task.id || null,
    status: task.status || null,
    provider: task.metadata?.provider || null,
    provider_status: task.metadata?.provider_status || null,
    composition_mode:
      task.input?.composition_plan?.mode ||
      task.input?.specification?.shot?.composition_plan?.mode ||
      null,
    evidence_binding_hash:
      task.metadata?.evidence_binding_hash ||
      task.input?.evidence_binding_hash ||
      null,
    attempt: Number(task.metadata?.attempt || 0),
    max_attempts: Number(task.metadata?.max_attempts || 0),
    actual_cost: Number(task.cost?.actual || 0),
    currency: task.cost?.currency || null,
    provider_dispatched:
      task.metadata?.provider_dispatched === true,
    usage_created: task.metadata?.usage_created === true,
    wallet_reserved: task.metadata?.wallet_reserved === true,
    error: task.error || null,
  };
}

async function prepareAuthorizedFullScene({
  organization_id,
  creative_project_id,
  approval_candidate,
  proof_authorization,
  authorized_preparation,
}) {
  const validated = validateBundle({
    organization_id,
    creative_project_id,
    approval_candidate,
    proof_authorization,
    authorized_preparation,
    require_paid_confirmation: false,
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

  const checkpointAuthorization = object(
    project.metadata?.master_still_pilot_checkpoint
      ?.proof_authorization,
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

  const evidenceBinding = object(
    project.metadata?.authorized_proof_evidence_binding,
  );
  const evidenceBindingHash = text(evidenceBinding.binding_hash);

  if (!evidenceBindingHash) {
    throw runtimeError(
      "CREATIVE_APPROVED_EVIDENCE_BINDING_REQUIRED",
    );
  }
  if (
    text(evidenceBinding.proof_authorization_hash) &&
    text(evidenceBinding.proof_authorization_hash) !==
      text(validated.authorization.authorization_hash)
  ) {
    throw runtimeError(
      "CREATIVE_EVIDENCE_BINDING_AUTHORIZATION_MISMATCH",
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

  const fullScenePreparation =
    await CreativeMaskedPilotPreparationRuntime.prepare({
      organization_id,
      creative_project_id,
      scene_number: validated.proofShot.scene_number,
      shot_number: validated.proofShot.shot_number,
      generation_plan: {
        composition_plan: {
          mode: FULL_SCENE_MODE,
        },
      },
    });
  const scope = { organization_id, creative_project_id };
  const [masterPrepared, qaPrepared] = await Promise.all([
    ProductionTaskRuntime.get(masterBefore.id, scope),
    ProductionTaskRuntime.get(qaBefore.id, scope),
  ]);

  assertPreparedTask(masterPrepared, evidenceBindingHash);
  assertPreparedTask(qaPrepared, evidenceBindingHash);

  await CreativeProjectRuntime.update(creative_project_id, {
    metadata: {
      ...(project.metadata || {}),
      authorized_full_scene_master_still_preflight: {
        version: RUNTIME_VERSION,
        prepared_at: new Date().toISOString(),
        proof_authorization_hash:
          validated.authorization.authorization_hash,
        evidence_binding_hash: evidenceBindingHash,
        execution_plan_id: plan.id,
        master_task_id: masterPrepared.id,
        qa_task_id: qaPrepared.id,
        proof_shot_key: validated.proofShot.key,
        composition_mode: FULL_SCENE_MODE,
        masked_composition_allowed: false,
        provider_dispatched: false,
        usage_created: false,
        wallet_reserved: false,
      },
    },
  });

  return {
    success: true,
    prepared_only: true,
    runtime_version: RUNTIME_VERSION,
    organization_id,
    creative_project_id,
    execution_plan_id: plan.id,
    proof_shot: validated.proofShot,
    proof_authorization_hash:
      validated.authorization.authorization_hash,
    evidence_binding_hash: evidenceBindingHash,
    full_scene_only: true,
    composition_mode: FULL_SCENE_MODE,
    masked_composition_allowed: false,
    provider_dispatched: false,
    usage_created: false,
    wallet_reserved: false,
    wallet_charged: false,
    master_task: summarizeTask(masterPrepared),
    qa_task: summarizeTask(qaPrepared),
    full_scene_preparation: fullScenePreparation,
    next_gate:
      "FULL_SCENE_MASTER_STILL_REQUIRES_EXPLICIT_PAID_CONFIRMATION",
  };
}

export const CreativeAuthorizedFullSceneMasterStillRuntime = {
  async prepare(input = {}) {
    return prepareAuthorizedFullScene(input);
  },

  async run({
    organization_id,
    creative_project_id,
    approval_candidate,
    proof_authorization,
    authorized_preparation,
    explicit_confirmation,
    accept_paid_execution = false,
  } = {}) {
    const validated = validateBundle({
      organization_id,
      creative_project_id,
      approval_candidate,
      proof_authorization,
      authorized_preparation,
      require_paid_confirmation: true,
      explicit_confirmation,
      accept_paid_execution,
    });
    const preflight = await prepareAuthorizedFullScene({
      organization_id,
      creative_project_id,
      approval_candidate,
      proof_authorization,
      authorized_preparation,
    });
    const project = await CreativeProjectRuntime.get(
      creative_project_id,
    );

    await CreativeProjectRuntime.update(creative_project_id, {
      metadata: {
        ...(project.metadata || {}),
        authorized_master_still_execution: {
          version: RUNTIME_VERSION,
          proof_authorization_hash:
            validated.authorization.authorization_hash,
          evidence_binding_hash:
            preflight.evidence_binding_hash,
          execution_plan_id: preflight.execution_plan_id,
          master_task_id: preflight.master_task.id,
          qa_task_id: preflight.qa_task.id,
          proof_shot_key: validated.proofShot.key,
          composition_mode: FULL_SCENE_MODE,
          masked_composition_allowed: false,
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

    if (
      text(execution.execution_plan_id) !==
      text(preflight.execution_plan_id)
    ) {
      throw runtimeError(
        "CREATIVE_AUTHORIZED_GENERATION_EXECUTED_WRONG_PLAN",
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
      ProductionTaskRuntime.get(preflight.master_task.id, scope),
      ProductionTaskRuntime.get(preflight.qa_task.id, scope),
    ]);

    for (const task of [masterAfter, qaAfter]) {
      const mode = String(
        task?.input?.composition_plan?.mode ||
        task?.input?.specification?.shot?.composition_plan?.mode ||
        "",
      ).toUpperCase();

      if (
        text(task?.metadata?.proof_authorization_hash) !==
          text(validated.authorization.authorization_hash) ||
        text(task?.metadata?.evidence_binding_hash) !==
          text(preflight.evidence_binding_hash) ||
        mode !== FULL_SCENE_MODE ||
        task?.metadata?.masked_composition_prepared === true ||
        Number(task?.metadata?.max_attempts || 0) !== 1
      ) {
        throw runtimeError(
          "CREATIVE_AUTHORIZED_FULL_SCENE_TASK_LOCK_MISSING",
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
      ? "FULL_SCENE_MASTER_STILL_HUMAN_REVIEW_REQUIRED"
      : qualityFailed
        ? "FULL_SCENE_MASTER_STILL_QA_FAILED_REPAIR_REQUIRES_EXPLICIT_CONFIRMATION"
        : masterFailed
          ? "FULL_SCENE_MASTER_STILL_GENERATION_FAILED_MANUAL_REVIEW_REQUIRED"
          : execution.next_gate ||
            "FULL_SCENE_MASTER_STILL_PROCESSING";

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
      evidence_binding_hash:
        preflight.evidence_binding_hash,
      execution_plan_id: preflight.execution_plan_id,
      proof_shot: validated.proofShot,
      full_scene_only: true,
      composition_mode: FULL_SCENE_MODE,
      masked_composition_allowed: false,
      full_scene_preflight: preflight,
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