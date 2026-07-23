import {
  CreativeMasterStillPilotRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotRuntime";

import {
  CreativeMasterStillPilotRepairSafeRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotRepairSafeRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  deterministicUuid,
} from "@/lib/operations/tasks/identity/ProductionTaskIdentity";

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function keyOf(value = {}) {
  if (typeof value === "string") return value;

  return (
    value.id ||
    value.asset_id ||
    value.image_url ||
    value.file_url ||
    value.url ||
    null
  );
}

function dedupe(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (!value) continue;
    const key = keyOf(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

async function refreshReference(value) {
  const id = typeof value === "string"
    ? value
    : value?.id || value?.asset_id || null;

  if (!id) return value;

  const fresh = await CreativeAssetsRuntime.get(id)
    .catch(() => null);

  if (!fresh) return value;

  if (typeof value === "string") return fresh;

  return {
    ...value,
    ...fresh,
    reference_roles:
      value.reference_roles || fresh.reference_roles || [],
    metadata: {
      ...(fresh.metadata || {}),
      ...(value.metadata || {}),
      reference_delivery_refreshed: true,
      reference_delivery_refreshed_at:
        new Date().toISOString(),
    },
  };
}

function failureCode(task = null) {
  return String(
    task?.metadata?.structured_failure?.code ||
    task?.error ||
    "",
  ).toUpperCase();
}

function recoveryMode(task = null) {
  if (!task || task.status !== "FAILED") return null;
  if (Number(task.cost?.actual || 0) !== 0) return null;
  if (task.output?.provider_submission) return null;

  const failure = failureCode(task);

  if (
    /^REFERENCE_IMAGE_DOWNLOAD_FAILED_\d+$/.test(failure) &&
    Number(
      task.metadata?.repair_reference_delivery_resume_attempt || 0,
    ) < 1
  ) {
    return "DELIVERY_REFRESH";
  }

  if (
    [
      "REFERENCE_ASSET_IS_NOT_AN_IMAGE",
      "REFERENCE_IMAGE_EMPTY",
      "REFERENCE_IMAGE_TOO_LARGE",
      "NO_VALID_REFERENCE_IMAGES",
    ].includes(failure) &&
    Number(
      task.metadata?.repair_reference_validation_resume_attempt || 0,
    ) < 1
  ) {
    return "REFERENCE_VALIDATION";
  }

  return null;
}

async function resolveRepairContext(input = {}) {
  const initial = await CreativeMasterStillPilotRuntime.run(input);
  const originalMasterId = initial.master_still?.id || null;
  const originalQaId = initial.quality_review?.id || null;

  if (!originalMasterId || !originalQaId) {
    return {
      initial,
      scope: null,
      repairMaster: null,
    };
  }

  const repairMasterId = deterministicUuid(
    `AVANTIQO_MASTER_STILL_REPAIR_V1:${originalMasterId}`,
  );
  const scope = {
    organization_id: input.organization_id,
    creative_project_id: input.creative_project_id,
  };
  const repairMaster = await ProductionTaskRuntime.get(
    repairMasterId,
    scope,
  );

  return {
    initial,
    scope,
    repairMaster,
  };
}

async function resumeReferenceDelivery(input = {}) {
  if (input.retry_preflight_blocked !== true) {
    return {
      resumed: false,
      mode: null,
      reference_count: 0,
      failed_reference_count: 0,
    };
  }

  const context = await resolveRepairContext(input);
  const task = context.repairMaster;
  const mode = recoveryMode(task);

  if (!context.scope || !mode) {
    return {
      resumed: false,
      mode: null,
      reference_count: 0,
      failed_reference_count: 0,
    };
  }

  const original = dedupe([
    ...list(task.input?.reference_assets),
    ...list(task.input?.assets),
  ]);
  const refreshed = await Promise.all(
    original.map(refreshReference),
  );
  const references = dedupe(refreshed);
  const failedReferenceCount = references.filter((reference) => (
    !reference ||
    typeof reference === "string" ||
    !(
      reference.image_url ||
      reference.file_url ||
      reference.url
    )
  )).length;

  if (!references.length || failedReferenceCount > 0) {
    return {
      resumed: false,
      mode,
      reference_count: references.length,
      failed_reference_count: failedReferenceCount,
    };
  }

  const marker = mode === "DELIVERY_REFRESH"
    ? {
        repair_reference_delivery_resume_attempt: 1,
        repair_reference_delivery_reference_count:
          references.length,
        repair_reference_delivery_resumed_at:
          new Date().toISOString(),
      }
    : {
        repair_reference_validation_resume_attempt: 1,
        repair_reference_validation_reference_count:
          references.length,
        repair_reference_validation_resumed_at:
          new Date().toISOString(),
      };

  await ProductionTaskRuntime.update(
    task.id,
    {
      status: "WAITING",
      error: null,
      input: {
        ...(task.input || {}),
        reference_assets: references,
        assets: references,
      },
      timing: {
        ...(task.timing || {}),
        started_at: null,
        completed_at: null,
      },
      metadata: {
        ...(task.metadata || {}),
        attempt: 0,
        provider_status:
          mode === "DELIVERY_REFRESH"
            ? "REFERENCE_DELIVERY_RESUME_READY"
            : "REFERENCE_VALIDATION_RESUME_READY",
        structured_failure: null,
        ...marker,
      },
      worker_id: null,
      lease_expires_at: null,
    },
    context.scope,
  );

  return {
    resumed: true,
    mode,
    reference_count: references.length,
    failed_reference_count: 0,
  };
}

export const CreativeMasterStillPilotReferenceDeliveryRecoveryRuntime = {
  async run(input = {}) {
    const deliveryRecovery = await resumeReferenceDelivery(input);
    const result = await CreativeMasterStillPilotRepairSafeRuntime.run(input);

    return {
      ...result,
      repair_attempt: {
        ...(result.repair_attempt || {}),
        reference_delivery_resumed:
          deliveryRecovery.resumed,
        reference_recovery_mode:
          deliveryRecovery.mode,
        reference_delivery_reference_count:
          deliveryRecovery.reference_count,
        reference_delivery_failed_reference_count:
          deliveryRecovery.failed_reference_count,
      },
    };
  },
};
