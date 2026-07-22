import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  UsageRuntime,
} from "@/lib/platform/service-runtime/usage/UsageRuntime";

import {
  WalletRepository,
} from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";

import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";

function specification(task = {}) {
  return task.input?.specification || {};
}

function sceneNumber(task = {}) {
  return Number(
    specification(task).scene?.number ||
    task.metadata?.scene_number ||
    0,
  );
}

function shotNumber(task = {}) {
  return Number(
    specification(task).shot?.number ||
    task.metadata?.shot_number ||
    0,
  );
}

function isMasterStill(task = {}) {
  return String(
    task.metadata?.deliverable || "",
  ).toUpperCase() === "MASTER_STILL";
}

function metadataTaskId(metadata = {}) {
  return (
    metadata.task?.id ||
    metadata.production_task_id ||
    metadata.task_id ||
    null
  );
}

function usageMatchesTask(usage = {}, taskId) {
  return String(metadataTaskId(usage.metadata || {})) === String(taskId);
}

function compactUsage(usage = {}) {
  return {
    id: usage.id || null,
    status: usage.status || null,
    provider: usage.provider || null,
    capability: usage.capability || null,
    customer_price: Number(usage.customer_price || 0),
    supplier_cost: Number(usage.supplier_cost || 0),
    currency: usage.currency || null,
    invoice_status: usage.invoice_status || null,
    error_message: usage.error_message || null,
    execution_stage:
      usage.metadata?.execution_stage || null,
    created_at: usage.created_at || null,
    updated_at: usage.updated_at || null,
  };
}

function compactTransaction(transaction = {}) {
  return {
    id: transaction.id || null,
    type: transaction.type || null,
    amount: Number(transaction.amount || 0),
    currency: transaction.currency || null,
    provider: transaction.provider || null,
    usage_id: transaction.usage_id || null,
    reference: transaction.reference || null,
    created_at: transaction.created_at || null,
  };
}

function transactionSummary(transactions = []) {
  const totals = {
    RESERVE: 0,
    RELEASE: 0,
    CHARGE: 0,
  };

  for (const transaction of transactions) {
    const type = String(transaction.type || "").toUpperCase();
    if (Object.prototype.hasOwnProperty.call(totals, type)) {
      totals[type] += Number(transaction.amount || 0);
    }
  }

  return {
    totals,
    reservation_balance:
      totals.RESERVE - totals.RELEASE - totals.CHARGE,
    charged: totals.CHARGE > 0,
    fully_released:
      totals.RESERVE > 0 &&
      totals.RELEASE >= totals.RESERVE &&
      totals.CHARGE === 0,
  };
}

export const CreativeMaskedPilotForensicsRuntime = {
  async inspect({
    organization_id,
    creative_project_id,
    scene_number = 1,
    shot_number = 1,
  } = {}) {
    if (!organization_id) {
      throw new Error("organization_id required");
    }
    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }

    const tasks = await ProductionTaskRuntime.list({
      organization_id,
      creative_project_id,
    });
    const task = (tasks || []).find((candidate) => (
      isMasterStill(candidate) &&
      sceneNumber(candidate) === Number(scene_number) &&
      shotNumber(candidate) === Number(shot_number)
    ));

    if (!task) {
      throw new Error("MASKED_MASTER_STILL_TASK_NOT_FOUND");
    }

    const [organizationUsage, organizationTransactions, stored] =
      await Promise.all([
        UsageRuntime.organization(organization_id),
        WalletRepository.transactions(organization_id),
        CreativeStorageRuntime.findStoredAsset({
          organization_id,
          creative_project_id,
          asset_id: task.id,
        }),
      ]);

    const matchingUsage = (organizationUsage || [])
      .filter((usage) => usageMatchesTask(usage, task.id))
      .sort((left, right) =>
        String(right.created_at || "").localeCompare(
          String(left.created_at || ""),
        ),
      );
    const usageIds = new Set(
      matchingUsage.map((usage) => String(usage.id)),
    );
    const matchingTransactions = (organizationTransactions || [])
      .filter((transaction) => (
        usageIds.has(String(transaction.usage_id || "")) ||
        usageIds.has(String(transaction.reference || ""))
      ))
      .sort((left, right) =>
        String(right.created_at || "").localeCompare(
          String(left.created_at || ""),
        ),
      );
    const summary = transactionSummary(matchingTransactions);
    const providerMayHaveExecuted = matchingUsage.some((usage) =>
      ["SUCCESS", "FAILED"].includes(String(usage.status || "").toUpperCase()),
    );
    const canonicalAssetPresent = Boolean(stored?.storage_path);
    const charged = summary.charged;
    const unresolvedReservation = summary.reservation_balance > 0;
    const safeToRetry = Boolean(
      !charged &&
      !unresolvedReservation &&
      !canonicalAssetPresent &&
      matchingUsage.every((usage) =>
        String(usage.status || "").toUpperCase() === "FAILED",
      )
    );

    return {
      success: true,
      forensic_only: true,
      provider_dispatched: false,
      usage_created: false,
      wallet_changed: false,
      organization_id,
      creative_project_id,
      task: {
        id: task.id,
        status: task.status,
        provider_status: task.metadata?.provider_status || null,
        error: task.error || null,
        error_code:
          task.metadata?.structured_failure?.code || null,
        actual_cost: Number(task.cost?.actual || 0),
        attempt: Number(task.metadata?.attempt || 0),
        masked_composition_prepared:
          task.metadata?.masked_composition_prepared === true,
      },
      usage: matchingUsage.map(compactUsage),
      wallet_transactions:
        matchingTransactions.map(compactTransaction),
      wallet_summary: summary,
      storage: stored
        ? {
            present: true,
            storage_path: stored.storage_path,
            signed_url: stored.signed_url,
            byte_size: Number(stored.byte_size || 0),
            content_type: stored.content_type || null,
          }
        : {
            present: false,
          },
      provider_may_have_executed: providerMayHaveExecuted,
      charged,
      unresolved_reservation: unresolvedReservation,
      canonical_asset_present: canonicalAssetPresent,
      safe_to_retry: safeToRetry,
      next_gate: canonicalAssetPresent
        ? "RECOVER_CANONICAL_MASKED_MASTER"
        : charged || unresolvedReservation
          ? "BILLING_RECONCILIATION_REQUIRED"
          : safeToRetry
            ? "MASKED_MASTER_RETRY_ALLOWED"
            : "MANUAL_EXECUTION_REVIEW_REQUIRED",
    };
  },
};
