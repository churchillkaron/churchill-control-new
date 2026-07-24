import {
  ExecutionRuntime,
} from "@/lib/creative/execution/runtime/ExecutionRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  buildProductionTaskIdentityMap,
} from "@/lib/operations/tasks/identity/ProductionTaskIdentity";

import {
  compileCreativeShotBlockingContract,
  assertCreativeShotBlockingContract,
} from "@/lib/creative/production/contracts/CreativeShotBlockingContract";

const RUNTIME_VERSION =
  "CREATIVE_AUTHORIZED_MASTER_STILL_PREFLIGHT_RECOVERY_V1";
const AUTHORIZATION_VERSION =
  "CREATIVE_MASTER_STILL_PROOF_AUTHORIZATION_V2";
const PREPARATION_VERSION =
  "CREATIVE_AUTHORIZED_MASTER_STILL_PREPARATION_V1";
const GENERATION_VERSION =
  "CREATIVE_AUTHORIZED_MASTER_STILL_GENERATION_V1";
const ENRICHMENT_VERSION =
  "CREATIVE_SHOT_DIRECTION_ENRICHMENT_V1";
const FAILURE_CODE =
  "CREATIVE_SHOT_DIRECTION_ENRICHMENT_INSUFFICIENT";
const CONFIRMATION_TOKEN =
  "RECOVER_ZERO_COST_AUTHORIZED_MASTER_STILL_PREFLIGHT";
const MASTER_STILL = "MASTER_STILL";
const MASTER_STILL_QA = "MASTER_STILL_QA";

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

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
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

function storyShot(story = {}, key) {
  let selected = null;

  list(story.scenes).forEach((scene, sceneIndex) => {
    list(scene.shots).forEach((shot, shotIndex) => {
      if (`${sceneIndex + 1}:${shotIndex + 1}` === key) {
        const { shots: ignoredShots, ...sceneWithoutShots } = scene;
        selected = {
          scene: sceneWithoutShots,
          shot,
          scene_number: sceneIndex + 1,
          shot_number: shotIndex + 1,
        };
      }
    });
  });

  return selected;
}

function findPair(plan = {}, requestedScene, requestedShot) {
  const steps = list(plan.steps);
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

  if (!master || !qa || steps.length !== 2) {
    throw runtimeError(
      "CREATIVE_PREFLIGHT_RECOVERY_PLAN_PAIR_INVALID",
      {
        step_count: steps.length,
        master_found: Boolean(master),
        qa_found: Boolean(qa),
      },
    );
  }

  return { master, qa };
}

function failureCode(task = {}) {
  return text(
    task.metadata?.structured_failure?.code ||
    task.metadata?.preflight_code ||
    task.error,
  ).toUpperCase();
}

function spendMarkers(task = {}) {
  return {
    actual_cost: Number(task.cost?.actual || 0),
    provider_submission: Boolean(task.output?.provider_submission),
    provider_dispatched:
      task.metadata?.provider_dispatched === true,
    wallet_reserved:
      task.metadata?.wallet_reserved === true,
    wallet_charged:
      task.metadata?.wallet_charged === true,
    usage_created:
      task.metadata?.usage_created === true,
    provider_job_id: Boolean(task.metadata?.provider_job_id),
    asset_id: Boolean(task.output?.asset_id),
    asset_url: Boolean(
      task.output?.image_url ||
      task.output?.url ||
      task.output?.asset?.url,
    ),
  };
}

function assertZeroCostUndispatchedFailure(task = {}) {
  const markers = spendMarkers(task);
  const spendStarted =
    markers.actual_cost > 0 ||
    markers.provider_submission ||
    markers.provider_dispatched ||
    markers.wallet_reserved ||
    markers.wallet_charged ||
    markers.usage_created ||
    markers.provider_job_id ||
    markers.asset_id ||
    markers.asset_url;

  if (String(task.status || "").toUpperCase() !== "FAILED") {
    throw runtimeError(
      "CREATIVE_PREFLIGHT_RECOVERY_FAILED_TASK_REQUIRED",
      { status: task.status || null },
    );
  }
  if (failureCode(task) !== FAILURE_CODE) {
    throw runtimeError(
      "CREATIVE_PREFLIGHT_RECOVERY_FAILURE_CODE_INVALID",
      {
        expected: FAILURE_CODE,
        actual: failureCode(task) || null,
      },
    );
  }
  if (spendStarted) {
    throw runtimeError(
      "CREATIVE_PREFLIGHT_RECOVERY_FORBIDDEN_AFTER_SPEND_STARTED",
      markers,
    );
  }
  if (
    Number(task.metadata?.authorized_preflight_recovery_attempt || 0) >= 1
  ) {
    throw runtimeError(
      "CREATIVE_PREFLIGHT_RECOVERY_LIMIT_EXCEEDED",
      { maximum: 1 },
    );
  }

  return markers;
}

function providerBrief({ scene, shot, contract }) {
  const sections = [
    `STORY PURPOSE: ${text(shot.story_purpose || contract.story_purpose)}`,
    `NARRATIVE STATE BEFORE: ${text(shot.narrative_state_before || contract.narrative_state_before)}`,
    `NARRATIVE STATE AFTER: ${text(shot.narrative_state_after || contract.narrative_state_after)}`,
    `DECISIVE FRAME: ${text(shot.decisive_moment || contract.decisive_moment)}`,
    `OPENING FRAME: ${text(shot.opening_frame || contract.opening_frame)}`,
    `CLOSING FRAME: ${text(shot.closing_frame || contract.closing_frame)}`,
    `SCREEN DIRECTION: ${text(shot.screen_direction || contract.screen_direction)}`,
    `ENVIRONMENT ACTION: ${text(shot.environment_action || contract.environment_action)}`,
    `PERFORMANCE DIRECTION: ${text(shot.performance_direction)}`,
    `CAMERA: ${JSON.stringify(shot.camera || {})}`,
    `FOREGROUND: ${JSON.stringify(shot.foreground_action || contract.foreground_action || {})}`,
    `MIDGROUND: ${JSON.stringify(shot.midground_action || contract.midground_action || {})}`,
    `BACKGROUND: ${JSON.stringify(shot.background_action || contract.background_action || {})}`,
    `ACTORS: ${JSON.stringify(contract.actors || [])}`,
    `SUBJECT PATHS: ${JSON.stringify(contract.subject_paths || [])}`,
    `RELATIONSHIPS: ${JSON.stringify(contract.relationships || [])}`,
    `REFERENCE GROUNDING: ${text(shot.reference_grounding || contract.reference_grounding)}`,
    `PRESERVE FROM REFERENCES: ${JSON.stringify(list(shot.preserve_from_references))}`,
    `CREATIVE INTERPRETATION BOUNDARY: ${JSON.stringify(list(shot.may_interpret_creatively))}`,
    `MISSING EVIDENCE: ${JSON.stringify(list(shot.missing_evidence))}`,
    `FORBIDDEN INTERPRETATIONS: ${JSON.stringify(contract.forbidden_interpretations || [])}`,
    `STILL FRAME RULES: ${JSON.stringify(contract.still_frame_rules || [])}`,
    `SCENE CONTEXT: ${JSON.stringify(scene || {})}`,
  ];
  const executionRules = [
    "Render one physically possible frozen instant only.",
    "The declared narrative role, visible action, body orientation, gaze, interaction target and spatial relationship of every important subject must agree in the same frame.",
    "Do not reverse the declared action or direction, merge an initiating action with a later consequence, or substitute generic posing for the required story event.",
    "Camera terminology controls framing and optical character only; it must not introduce temporal progression, object travel, focus movement or a second time state.",
    "Use the supplied references only for the evidence roles they actually prove. Do not invent unsupported identity, location, product, text or brand fidelity.",
    "Human anatomy, contact, weight distribution, occlusion, scale, perspective, reflections, lighting and depth of field must remain physically coherent.",
    "Visible text is prohibited unless an approved controlled-composite element is explicitly declared in the shot contract.",
    "The image must be commercially polished, photographically credible, emotionally readable and suitable for strict visual QA against the approved story and references.",
  ];

  return [
    text(shot.provider_brief),
    ...sections,
    "EXECUTION RULES:",
    ...executionRules,
  ].filter(Boolean).join("\n\n");
}

function qaChecks(shot = {}, contract = {}) {
  return unique([
    ...list(shot.qa_checks),
    "The image contains exactly one decisive static moment.",
    "The visible action matches the approved story purpose.",
    "No subject performs the opposite or a later action.",
    "Every declared narrative role is visually legible.",
    "Body orientation, gaze and interaction targets agree.",
    "Screen direction matches the approved contract.",
    "The reference-grounded elements match only supported evidence.",
    "No unsupported identity, location, product, brand or text is invented.",
    "Human anatomy and physical contact are credible.",
    "Perspective, scale, lighting, reflections and depth of field are coherent.",
    "The frame avoids generic posing and communicates the required event without captions.",
    "No forbidden interpretation in the blocking contract is visible.",
  ]).slice(0, 40);
}

function forbiddenInterpretations(shot = {}, contract = {}) {
  return unique([
    ...list(contract.forbidden_interpretations),
    ...list(shot.forbidden_interpretations),
    ...list(shot.negative_constraints),
    "Do not reverse the approved action or direction.",
    "Do not combine multiple time states in one still.",
    "Do not replace narrative action with generic posing.",
    "Do not invent unsupported factual identity or setting details.",
    "Do not introduce uncontrolled visible text.",
    "Do not create anatomically impossible contact or staging.",
  ]);
}

function buildRecoveredInput({
  task,
  selected,
  authorization,
}) {
  const scene = clone(selected.scene);
  const shot = clone(selected.shot);
  const forbidden = forbiddenInterpretations(
    shot,
    compileCreativeShotBlockingContract({ scene, shot }),
  );
  const enrichedShot = {
    ...shot,
    forbidden_interpretations: forbidden,
    negative_constraints: unique([
      ...list(shot.negative_constraints),
      ...forbidden,
    ]),
  };
  const blockingContract = compileCreativeShotBlockingContract({
    scene,
    shot: enrichedShot,
  });

  assertCreativeShotBlockingContract(blockingContract);

  const brief = providerBrief({
    scene,
    shot: enrichedShot,
    contract: blockingContract,
  });
  const checks = qaChecks(enrichedShot, blockingContract);

  if (brief.length < 900 || checks.length < 10 || forbidden.length < 6) {
    throw runtimeError(
      "CREATIVE_PREFLIGHT_RECOVERY_APPROVED_DIRECTION_INSUFFICIENT",
      {
        provider_brief_characters: brief.length,
        qa_check_count: checks.length,
        forbidden_interpretation_count: forbidden.length,
      },
    );
  }

  const enrichment = {
    version: ENRICHMENT_VERSION,
    prepared_at: new Date().toISOString(),
    quality_mode: "APPROVED_STORY_DETERMINISTIC",
    reasoning_passes: 0,
    reasoning_token_budget: 0,
    reference_grounding:
      text(enrichedShot.reference_grounding || blockingContract.reference_grounding)
        .toUpperCase(),
    preserve_from_references:
      list(enrichedShot.preserve_from_references),
    may_interpret_creatively:
      list(enrichedShot.may_interpret_creatively),
    missing_evidence:
      list(enrichedShot.missing_evidence),
    assumptions: [],
    provider_brief: brief,
    qa_checks: checks,
    blocking_contract: blockingContract,
    approved_story_bound: true,
    proof_authorization_hash:
      authorization.authorization_hash,
    authorized_shot_hash:
      authorization.proof_shot?.shot_hash || null,
  };
  const originalSpecification = object(task.input?.specification);

  return {
    ...(task.input || {}),
    specification: {
      ...originalSpecification,
      scene,
      shot: {
        ...enrichedShot,
        blocking_contract: blockingContract,
        direction_enrichment: enrichment,
      },
      blocking_contract: blockingContract,
      direction_enrichment: enrichment,
    },
    blocking_contract: blockingContract,
    direction_enrichment: enrichment,
    prompt: [
      task.input?.prompt || "",
      "APPROVED HASH-BOUND PROVIDER DIRECTION:",
      brief,
      "AUTHORITATIVE BINARY QA CHECKS:",
      JSON.stringify(checks),
    ].filter(Boolean).join("\n\n"),
  };
}

function validateEnvelope({
  organization_id,
  creative_project_id,
  approval_candidate,
  proof_authorization,
  authorized_preparation,
  failed_generation_result,
  explicit_confirmation,
}) {
  const candidate = object(approval_candidate);
  const authorization = object(proof_authorization);
  const preparation = object(authorized_preparation);
  const generation = object(failed_generation_result);

  if (text(explicit_confirmation) !== CONFIRMATION_TOKEN) {
    throw runtimeError(
      "CREATIVE_PREFLIGHT_RECOVERY_EXPLICIT_CONFIRMATION_REQUIRED",
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
    throw runtimeError("CREATIVE_PROOF_AUTHORIZATION_REQUIRED");
  }
  if (
    preparation.success !== true ||
    preparation.preparation_version !== PREPARATION_VERSION
  ) {
    throw runtimeError("CREATIVE_AUTHORIZED_PREPARATION_REQUIRED");
  }
  if (
    generation.generation_version !== GENERATION_VERSION ||
    generation.success === true
  ) {
    throw runtimeError(
      "CREATIVE_FAILED_AUTHORIZED_GENERATION_RESULT_REQUIRED",
    );
  }

  for (const value of [candidate, authorization, preparation, generation]) {
    if (
      String(value.organization_id || "") !==
      String(organization_id || "") ||
      String(value.creative_project_id || "") !==
      String(creative_project_id || "")
    ) {
      throw runtimeError(
        "CREATIVE_PREFLIGHT_RECOVERY_SCOPE_MISMATCH",
      );
    }
  }

  if (
    text(preparation.proof_authorization_hash) !==
      text(authorization.authorization_hash) ||
    text(generation.proof_authorization_hash) !==
      text(authorization.authorization_hash) ||
    text(generation.execution_plan_id) !==
      text(preparation.preparation?.execution_plan?.id)
  ) {
    throw runtimeError(
      "CREATIVE_PREFLIGHT_RECOVERY_BINDING_MISMATCH",
    );
  }

  return {
    candidate,
    authorization,
    preparation,
    generation,
  };
}

export const CreativeAuthorizedMasterStillPreflightRecoveryRuntime = {
  async recover({
    organization_id,
    creative_project_id,
    approval_candidate,
    proof_authorization,
    authorized_preparation,
    failed_generation_result,
    explicit_confirmation,
  } = {}) {
    if (!organization_id) {
      throw runtimeError("organization_id required");
    }
    if (!creative_project_id) {
      throw runtimeError("creative_project_id required");
    }

    const envelope = validateEnvelope({
      organization_id,
      creative_project_id,
      approval_candidate,
      proof_authorization,
      authorized_preparation,
      failed_generation_result,
      explicit_confirmation,
    });
    const proofShot = object(envelope.authorization.proof_shot);
    const selected = storyShot(
      envelope.candidate.story,
      text(proofShot.key),
    );

    if (!selected) {
      throw runtimeError(
        "CREATIVE_PREFLIGHT_RECOVERY_APPROVED_SHOT_NOT_FOUND",
      );
    }

    const plans = await ExecutionRuntime.list({
      organization_id,
      creative_project_id,
    });
    const planId = text(
      envelope.preparation.preparation?.execution_plan?.id,
    );
    const plan = plans.find((value) => text(value.id) === planId);

    if (!plan) {
      throw runtimeError(
        "CREATIVE_PREFLIGHT_RECOVERY_PLAN_NOT_FOUND",
      );
    }

    const pair = findPair(
      plan,
      proofShot.scene_number,
      proofShot.shot_number,
    );
    const identityMap = buildProductionTaskIdentityMap({
      organization_id,
      creative_project_id,
      execution_plan_id: plan.id,
      steps: plan.steps || [],
    });
    const masterTaskId = identityMap.get(pair.master.id);
    const qaTaskId = identityMap.get(pair.qa.id);
    const scope = { organization_id, creative_project_id };
    const [masterTask, qaTask] = await Promise.all([
      ProductionTaskRuntime.get(masterTaskId, scope),
      ProductionTaskRuntime.get(qaTaskId, scope),
    ]);

    if (!masterTask || !qaTask) {
      throw runtimeError(
        "CREATIVE_PREFLIGHT_RECOVERY_TASK_PAIR_REQUIRED",
      );
    }
    if (
      text(envelope.generation.master_still?.id) !== text(masterTask.id) ||
      text(envelope.generation.quality_review?.id) !== text(qaTask.id)
    ) {
      throw runtimeError(
        "CREATIVE_PREFLIGHT_RECOVERY_TASK_BINDING_MISMATCH",
      );
    }
    if (
      text(masterTask.metadata?.proof_authorization_hash) !==
        text(envelope.authorization.authorization_hash) ||
      text(masterTask.metadata?.authorized_shot_hash) !==
        text(proofShot.shot_hash)
    ) {
      throw runtimeError(
        "CREATIVE_PREFLIGHT_RECOVERY_TASK_AUTHORIZATION_MISMATCH",
      );
    }

    const markers = assertZeroCostUndispatchedFailure(masterTask);

    if (
      String(qaTask.status || "").toUpperCase() !== "WAITING" ||
      Number(qaTask.cost?.actual || 0) !== 0 ||
      qaTask.metadata?.provider_dispatched === true
    ) {
      throw runtimeError(
        "CREATIVE_PREFLIGHT_RECOVERY_QA_STATE_INVALID",
        {
          status: qaTask.status || null,
          actual_cost: Number(qaTask.cost?.actual || 0),
          provider_dispatched:
            qaTask.metadata?.provider_dispatched === true,
        },
      );
    }

    const recoveredInput = buildRecoveredInput({
      task: masterTask,
      selected,
      authorization: envelope.authorization,
    });
    const recovered = await ProductionTaskRuntime.update(
      masterTask.id,
      {
        status: "WAITING",
        input: recoveredInput,
        timing: {
          ...(masterTask.timing || {}),
          started_at: null,
          completed_at: null,
        },
        metadata: {
          ...(masterTask.metadata || {}),
          attempt: 0,
          max_attempts: 1,
          provider_status: "AUTHORIZED_PREFLIGHT_RECOVERED",
          structured_failure: null,
          preflight_code: null,
          preflight_blocked: false,
          authorized_preflight_recovery_attempt: 1,
          authorized_preflight_recovered_at:
            new Date().toISOString(),
          approved_story_direction_compiled: true,
          direction_reasoning_executed: false,
          provider_dispatched: false,
          wallet_reserved: false,
          wallet_charged: false,
          usage_created: false,
        },
        worker_id: null,
        lease_expires_at: null,
        error: null,
      },
      scope,
    );

    return {
      success: true,
      recovery_only: true,
      recovery_version: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      proof_authorization_hash:
        envelope.authorization.authorization_hash,
      execution_plan_id: plan.id,
      proof_shot_key: proofShot.key,
      master_task: {
        id: recovered.id,
        status: recovered.status,
        attempt: Number(recovered.metadata?.attempt || 0),
        max_attempts:
          Number(recovered.metadata?.max_attempts || 0),
        provider_status:
          recovered.metadata?.provider_status || null,
        approved_story_direction_compiled:
          recovered.metadata?.approved_story_direction_compiled === true,
        direction_reasoning_executed:
          recovered.metadata?.direction_reasoning_executed === true,
        provider_brief_characters:
          text(recovered.input?.direction_enrichment?.provider_brief).length,
        qa_check_count:
          list(recovered.input?.direction_enrichment?.qa_checks).length,
        blocking_contract_complete:
          recovered.input?.direction_enrichment
            ?.blocking_contract?.completeness?.complete === true,
      },
      quality_review: {
        id: qaTask.id,
        status: qaTask.status,
        actual_cost: Number(qaTask.cost?.actual || 0),
      },
      original_spend_markers: markers,
      provider_dispatched: false,
      wallet_reserved: false,
      wallet_charged: false,
      usage_created: false,
      image_generated: false,
      video_generated: false,
      automatic_repair_dispatched: false,
      next_gate:
        "MASTER_STILL_PROOF_GENERATION_REQUIRES_NEW_EXPLICIT_CONFIRMATION",
    };
  },
};
