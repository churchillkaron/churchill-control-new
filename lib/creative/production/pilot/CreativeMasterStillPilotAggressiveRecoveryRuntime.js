import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  CreativeMasterStillPilotRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotRuntime";

const ACTIVE_STATUSES = new Set([
  "PLANNED",
  "WAITING",
  "READY",
  "RUNNING",
  "REVIEW",
]);

const VIDEO_TYPES = new Set([
  "GENERATE_VIDEO",
  "IMAGE_TO_VIDEO",
  "COMPOSE_SCENE",
  "RENDER_DRAFT",
  "RENDER_PRODUCTION",
]);

function normalizeCurrency(value) {
  const currency = String(value || "")
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    const error = new Error("VALID_CURRENCY_REQUIRED");
    error.code = error.message;
    throw error;
  }

  return currency;
}

function normalizeBalance(value) {
  const balance = Number(value);

  if (
    !Number.isFinite(balance) ||
    balance < 0 ||
    balance > 1000000000
  ) {
    const error = new Error("VALID_TEST_WALLET_BALANCE_REQUIRED");
    error.code = error.message;
    throw error;
  }

  return balance;
}

function object(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

async function configureOrganizationCurrency({
  organization_id,
  currency,
}) {
  const {
    data: organization,
    error: organizationError,
  } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", organization_id)
    .single();

  if (organizationError) throw organizationError;

  const organizationCurrencyField = [
    "default_currency",
    "currency",
    "base_currency",
    "functional_currency",
  ].find((field) => (
    Object.prototype.hasOwnProperty.call(
      organization,
      field,
    )
  ));

  if (organizationCurrencyField) {
    const {
      data,
      error,
    } = await supabaseAdmin
      .from("organizations")
      .update({
        [organizationCurrencyField]: currency,
        updated_at: new Date().toISOString(),
      })
      .eq("id", organization_id)
      .select("*")
      .single();

    if (error) throw error;

    return {
      source: "ORGANIZATION",
      field: organizationCurrencyField,
      record_id: data.id,
      currency,
    };
  }

  const {
    data: entities,
    error: entityListError,
  } = await supabaseAdmin
    .from("legal_entities")
    .select("id,currency")
    .eq("organization_id", organization_id)
    .limit(1);

  if (entityListError) throw entityListError;

  const entity = entities?.[0] || null;

  if (!entity?.id) {
    const error = new Error(
      "ORGANIZATION_OR_LEGAL_ENTITY_CURRENCY_FIELD_REQUIRED",
    );
    error.code = error.message;
    throw error;
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("legal_entities")
    .update({
      currency,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entity.id)
    .eq("organization_id", organization_id)
    .select("id,currency")
    .single();

  if (error) throw error;

  return {
    source: "LEGAL_ENTITY",
    field: "currency",
    record_id: data.id,
    currency: data.currency,
  };
}

async function resetTestWallet({
  organization_id,
  currency,
  available_balance,
}) {
  const {
    data: wallet,
    error: walletError,
  } = await supabaseAdmin
    .from("organization_wallets")
    .select("*")
    .eq("organization_id", organization_id)
    .maybeSingle();

  if (walletError) throw walletError;

  if (!wallet?.id) {
    const error = new Error("TEST_WALLET_REQUIRED");
    error.code = error.message;
    throw error;
  }

  const updates = {
    currency,
    available_balance,
    reserved_balance: 0,
    updated_at: new Date().toISOString(),
  };

  if (
    Object.prototype.hasOwnProperty.call(
      wallet,
      "default_currency",
    )
  ) {
    updates.default_currency = currency;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      wallet,
      "metadata",
    )
  ) {
    updates.metadata = {
      ...object(wallet.metadata),
      pilot_test_reset: {
        currency,
        available_balance,
        reset_at: new Date().toISOString(),
      },
    };
  }

  if (
    Object.prototype.hasOwnProperty.call(
      wallet,
      "configuration",
    )
  ) {
    updates.configuration = {
      ...object(wallet.configuration),
      currency,
    };
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("organization_wallets")
    .update(updates)
    .eq("id", wallet.id)
    .eq("organization_id", organization_id)
    .select("*")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    currency: data.currency,
    available_balance: Number(
      data.available_balance || 0,
    ),
    reserved_balance: Number(
      data.reserved_balance || 0,
    ),
  };
}

function activeVideoTasks(tasks = []) {
  return (tasks || []).filter((task) => (
    VIDEO_TYPES.has(task.type) &&
    ACTIVE_STATUSES.has(task.status)
  ));
}

async function assertNoActiveVideoTasks(scope) {
  const tasks = await ProductionTaskRuntime.list(scope);
  const blocked = activeVideoTasks(tasks);

  if (blocked.length) {
    const error = new Error(
      "ACTIVE_VIDEO_TASKS_BLOCK_AGGRESSIVE_PILOT_RECOVERY",
    );
    error.code = error.message;
    error.details = {
      task_ids: blocked.map((task) => task.id),
    };
    throw error;
  }

  return tasks;
}

async function resetPilotTask({
  task_id,
  expected_type,
  currency,
  scope,
}) {
  const task = await ProductionTaskRuntime.get(
    task_id,
    scope,
  );

  if (!task) {
    const error = new Error(
      `${expected_type}_PILOT_TASK_REQUIRED`,
    );
    error.code = error.message;
    throw error;
  }

  if (task.type !== expected_type) {
    const error = new Error(
      `PILOT_TASK_TYPE_MUST_BE_${expected_type}`,
    );
    error.code = error.message;
    error.details = {
      task_id,
      actual_type: task.type,
    };
    throw error;
  }

  return ProductionTaskRuntime.update(
    task.id,
    {
      status: "WAITING",
      output: {},
      error: null,
      cost: {
        ...object(task.cost),
        currency,
        actual: 0,
        approved: true,
      },
      timing: {
        ...object(task.timing),
        started_at: null,
        completed_at: null,
      },
      review: {
        ...object(task.review),
        approved: false,
        approved_by: null,
        notes: "",
      },
      metadata: {
        ...object(task.metadata),
        service_code:
          task.service_id ||
          task.metadata?.service_code ||
          null,
        attempt: 0,
        max_attempts: 1,
        provider_job_id: null,
        provider_status: "AGGRESSIVE_PILOT_RECOVERY_READY",
        provider_dispatched: false,
        wallet_reserved: false,
        wallet_charged: false,
        usage_created: false,
        preflight_blocked: false,
        preflight_code: null,
        structured_failure: null,
        quality_review: null,
        correction_instructions: [],
        automatic_retry_forbidden: false,
        aggressive_pilot_recovery_authorized: true,
        aggressive_pilot_recovery_authorized_at:
          new Date().toISOString(),
        video_execution_forbidden: true,
      },
      worker_id: null,
      lease_expires_at: null,
      next_attempt_at: null,
      last_heartbeat_at: null,
      dead_lettered_at: null,
      failure_class: null,
    },
    scope,
  );
}

export const CreativeMasterStillPilotAggressiveRecoveryRuntime = {
  async run({
    organization_id,
    creative_project_id,
    master_task_id,
    qa_task_id,
    scene_number = 1,
    shot_number = 1,
    currency,
    test_wallet_balance,
  } = {}) {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }

    if (!master_task_id) {
      throw new Error("master_task_id required");
    }

    if (!qa_task_id) {
      throw new Error("qa_task_id required");
    }

    const resolvedCurrency = normalizeCurrency(currency);
    const resolvedBalance = normalizeBalance(
      test_wallet_balance,
    );
    const scope = {
      organization_id,
      creative_project_id,
    };

    await assertNoActiveVideoTasks(scope);

    const currencyConfiguration =
      await configureOrganizationCurrency({
        organization_id,
        currency: resolvedCurrency,
      });

    const wallet = await resetTestWallet({
      organization_id,
      currency: resolvedCurrency,
      available_balance: resolvedBalance,
    });

    const [masterTask, qaTask] = await Promise.all([
      resetPilotTask({
        task_id: master_task_id,
        expected_type: "GENERATE_IMAGE",
        currency: resolvedCurrency,
        scope,
      }),
      resetPilotTask({
        task_id: qa_task_id,
        expected_type: "QUALITY_REVIEW",
        currency: resolvedCurrency,
        scope,
      }),
    ]);

    const startedAt = new Date().toISOString();

    const pilot = await CreativeMasterStillPilotRuntime.run({
      organization_id,
      creative_project_id,
      scene_number,
      shot_number,
      retry_preflight_blocked: false,
    });

    const tasksAfter = await assertNoActiveVideoTasks(scope);
    const imageUrl = pilot.master_still?.asset_url || null;

    return {
      success: Boolean(imageUrl),
      aggressive_recovery: true,
      one_image_only: true,
      automatic_repair_executed: false,
      director_reasoning_executed: false,
      video_execution_authorized: false,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      currency_configuration: currencyConfiguration,
      wallet,
      reset_tasks: {
        master_task_id: masterTask.id,
        qa_task_id: qaTask.id,
      },
      master_still_url: imageUrl,
      quality_passed:
        pilot.quality_review?.passed === true,
      quality_score: Number(
        pilot.quality_review?.overall_score || 0,
      ),
      next_gate: pilot.next_gate,
      pilot,
      task_counts: tasksAfter.reduce(
        (counts, task) => {
          counts[task.type] =
            Number(counts[task.type] || 0) + 1;
          return counts;
        },
        {},
      ),
      active_video_tasks: 0,
    };
  },
};
