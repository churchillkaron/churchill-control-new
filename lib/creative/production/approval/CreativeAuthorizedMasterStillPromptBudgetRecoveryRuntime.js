import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const RUNTIME_VERSION =
  "CREATIVE_AUTHORIZED_MASTER_STILL_PROMPT_BUDGET_RECOVERY_V1";
const CONFIRMATION_TOKEN =
  "RECOVER_ZERO_COST_AUTHORIZED_MASTER_STILL_PROMPT_BUDGET";
const MAX_PROMPT_CHARACTERS = 32000;
const TARGET_PROMPT_CHARACTERS = 28000;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function runtimeError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
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

function assertZeroSpend(task = {}) {
  const markers = spendMarkers(task);
  const started =
    markers.actual_cost > 0 ||
    markers.provider_submission ||
    markers.provider_dispatched ||
    markers.wallet_reserved ||
    markers.wallet_charged ||
    markers.usage_created ||
    markers.provider_job_id ||
    markers.asset_id ||
    markers.asset_url;

  if (started) {
    throw runtimeError(
      "CREATIVE_PROMPT_BUDGET_RECOVERY_FORBIDDEN_AFTER_SPEND_STARTED",
      markers,
    );
  }

  return markers;
}

function isPromptLengthFailure(task = {}) {
  const code = text(
    task.metadata?.structured_failure?.code ||
    task.metadata?.preflight_code,
  ).toLowerCase();
  const message = text(task.error).toLowerCase();

  return (
    code === "string_above_max_length" ||
    code === "creative_image_prompt_budget_exceeded" ||
    message.includes("prompt") &&
      message.includes("maximum length 32000")
  );
}

function compactPrompt(input = {}) {
  const direction = object(
    input.direction_enrichment ||
    input.specification?.direction_enrichment ||
    input.specification?.shot?.direction_enrichment,
  );
  const contract = object(
    input.blocking_contract ||
    input.specification?.blocking_contract ||
    input.specification?.shot?.blocking_contract,
  );
  const brief = text(direction.provider_brief);
  const checks = list(direction.qa_checks);
  const prompt = [
    "APPROVED HASH-BOUND MASTER STILL DIRECTION",
    direction.proof_authorization_hash
      ? `Proof authorization hash: ${direction.proof_authorization_hash}`
      : null,
    direction.authorized_shot_hash
      ? `Authorized shot hash: ${direction.authorized_shot_hash}`
      : null,
    brief,
    "AUTHORITATIVE BINARY QA CHECKS:",
    JSON.stringify(checks),
    "Render one decisive static frame only. Preserve every declared role, action, subject path, body orientation, gaze, interaction target, screen direction, reference boundary and forbidden interpretation in the supplied structured blocking contract. Do not reverse action or direction, combine multiple time states, invent unsupported identity, setting, product, brand or text, or replace narrative action with generic posing. Camera language controls framing only.",
  ].filter(Boolean).join("\n\n");

  if (
    direction.approved_story_bound !== true ||
    !direction.proof_authorization_hash ||
    !direction.authorized_shot_hash ||
    contract.completeness?.complete !== true
  ) {
    throw runtimeError(
      "CREATIVE_PROMPT_BUDGET_RECOVERY_APPROVED_DIRECTION_REQUIRED",
    );
  }

  if (brief.length < 900 || checks.length < 10) {
    throw runtimeError(
      "CREATIVE_PROMPT_BUDGET_RECOVERY_DIRECTION_INSUFFICIENT",
      {
        provider_brief_characters: brief.length,
        qa_check_count: checks.length,
      },
    );
  }

  if (prompt.length > TARGET_PROMPT_CHARACTERS) {
    throw runtimeError(
      "CREATIVE_PROMPT_BUDGET_RECOVERY_COMPACT_PROMPT_TOO_LONG",
      {
        actual_characters: prompt.length,
        target_characters: TARGET_PROMPT_CHARACTERS,
        maximum_characters: MAX_PROMPT_CHARACTERS,
      },
    );
  }

  return prompt;
}

export const CreativeAuthorizedMasterStillPromptBudgetRecoveryRuntime = {
  async recover({
    organization_id,
    creative_project_id,
    failed_generation_result,
    explicit_confirmation,
  } = {}) {
    if (!organization_id) {
      throw runtimeError("organization_id required");
    }
    if (!creative_project_id) {
      throw runtimeError("creative_project_id required");
    }
    if (text(explicit_confirmation) !== CONFIRMATION_TOKEN) {
      throw runtimeError(
        "CREATIVE_PROMPT_BUDGET_RECOVERY_EXPLICIT_CONFIRMATION_REQUIRED",
        { required_confirmation: CONFIRMATION_TOKEN },
      );
    }

    const generation = object(failed_generation_result);
    const masterSummary = object(generation.master_still);
    const qaSummary = object(generation.quality_review);

    if (
      generation.generation_version !==
        "CREATIVE_AUTHORIZED_MASTER_STILL_GENERATION_V1" ||
      generation.success === true
    ) {
      throw runtimeError(
        "CREATIVE_FAILED_AUTHORIZED_GENERATION_RESULT_REQUIRED",
      );
    }
    if (
      String(generation.organization_id || "") !==
        String(organization_id) ||
      String(generation.creative_project_id || "") !==
        String(creative_project_id)
    ) {
      throw runtimeError(
        "CREATIVE_PROMPT_BUDGET_RECOVERY_SCOPE_MISMATCH",
      );
    }
    if (!masterSummary.id || !qaSummary.id) {
      throw runtimeError(
        "CREATIVE_PROMPT_BUDGET_RECOVERY_TASK_PAIR_REQUIRED",
      );
    }

    const scope = { organization_id, creative_project_id };
    const [masterTask, qaTask] = await Promise.all([
      ProductionTaskRuntime.get(masterSummary.id, scope),
      ProductionTaskRuntime.get(qaSummary.id, scope),
    ]);

    if (!masterTask || !qaTask) {
      throw runtimeError(
        "CREATIVE_PROMPT_BUDGET_RECOVERY_TASK_PAIR_NOT_FOUND",
      );
    }
    if (String(masterTask.status || "").toUpperCase() !== "FAILED") {
      throw runtimeError(
        "CREATIVE_PROMPT_BUDGET_RECOVERY_FAILED_MASTER_REQUIRED",
        { status: masterTask.status || null },
      );
    }
    if (!isPromptLengthFailure(masterTask)) {
      throw runtimeError(
        "CREATIVE_PROMPT_BUDGET_RECOVERY_FAILURE_CODE_INVALID",
        {
          error: masterTask.error || null,
          code:
            masterTask.metadata?.structured_failure?.code ||
            masterTask.metadata?.preflight_code ||
            null,
        },
      );
    }
    if (
      Number(masterTask.metadata?.authorized_prompt_budget_recovery_attempt || 0) >= 1
    ) {
      throw runtimeError(
        "CREATIVE_PROMPT_BUDGET_RECOVERY_LIMIT_EXCEEDED",
        { maximum: 1 },
      );
    }
    if (
      String(qaTask.status || "").toUpperCase() !== "WAITING" ||
      Number(qaTask.cost?.actual || 0) !== 0
    ) {
      throw runtimeError(
        "CREATIVE_PROMPT_BUDGET_RECOVERY_QA_STATE_INVALID",
        {
          status: qaTask.status || null,
          actual_cost: Number(qaTask.cost?.actual || 0),
        },
      );
    }

    const markers = assertZeroSpend(masterTask);
    const prompt = compactPrompt(masterTask.input || {});
    const recovered = await ProductionTaskRuntime.update(
      masterTask.id,
      {
        status: "WAITING",
        input: {
          ...(masterTask.input || {}),
          prompt,
          prompt_contract: {
            ...(masterTask.input?.prompt_contract || {}),
            approved_story_bound: true,
            duplicate_blocking_contract_omitted: true,
            prompt_characters: prompt.length,
            maximum_characters: MAX_PROMPT_CHARACTERS,
            recovered_from_provider_length_rejection: true,
          },
        },
        timing: {
          ...(masterTask.timing || {}),
          started_at: null,
          completed_at: null,
        },
        metadata: {
          ...(masterTask.metadata || {}),
          attempt: 0,
          max_attempts: 1,
          provider_status: "AUTHORIZED_PROMPT_BUDGET_RECOVERED",
          structured_failure: null,
          preflight_code: null,
          preflight_blocked: false,
          authorized_prompt_budget_recovery_attempt: 1,
          authorized_prompt_budget_recovered_at:
            new Date().toISOString(),
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
        generation.proof_authorization_hash || null,
      execution_plan_id:
        generation.execution_plan_id || null,
      proof_shot_key:
        generation.proof_shot?.key || null,
      master_task: {
        id: recovered.id,
        status: recovered.status,
        attempt: Number(recovered.metadata?.attempt || 0),
        max_attempts:
          Number(recovered.metadata?.max_attempts || 0),
        provider_status:
          recovered.metadata?.provider_status || null,
        prompt_characters:
          text(recovered.input?.prompt).length,
        prompt_maximum_characters:
          MAX_PROMPT_CHARACTERS,
        approved_story_bound:
          recovered.input?.prompt_contract?.approved_story_bound === true,
        duplicate_blocking_contract_omitted:
          recovered.input?.prompt_contract
            ?.duplicate_blocking_contract_omitted === true,
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
