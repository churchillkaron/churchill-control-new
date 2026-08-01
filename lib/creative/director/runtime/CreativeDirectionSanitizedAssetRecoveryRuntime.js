import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  UsageRuntime,
} from "@/lib/platform/service-runtime/usage/UsageRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.direction-sanitized-asset-recovery.v2",
);

const cursors = new Map();

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function timestamp(value) {
  const parsed = Date.parse(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function serviceResultFromUsage(usage = {}, evidence = {}) {
  const providerResult = object(usage.metadata?.result);
  return {
    success: true,
    pending: false,
    provider: usage.provider || providerResult.provider || null,
    model: usage.metadata?.model || providerResult.model || null,
    pricing: usage.metadata?.settled_pricing || null,
    reservation_pricing: usage.metadata?.reservation_pricing || null,
    usage: {
      ...usage,
      metadata: {
        ...object(usage.metadata),
        sanitized_asset_compatibility_recovery: evidence,
      },
    },
    billing: {
      id: usage.billing_invoice_line_id || usage.invoice_id || null,
      usage,
    },
    settlement: "RECOVERED_PREVIOUSLY_CHARGED_USAGE",
    output: providerResult,
    sanitized_asset_compatibility_recovery: evidence,
  };
}

function originalApproval(metadata = {}, current = {}) {
  return list(metadata.paid_direction_approval_history)
    .filter((approval) => text(approval?.id))
    .filter((approval) => text(approval?.id) !== text(current.id))
    .filter((approval) =>
      text(approval?.scope).toUpperCase() ===
      "CREATIVE_DIRECTION_PIPELINE_BUDGET",
    )
    .filter((approval) => Number(approval?.maximum_calls || 0) >= 20)
    .sort((left, right) =>
      timestamp(right.completed_at || right.archived_at || right.approved_at) -
      timestamp(left.completed_at || left.archived_at || left.approved_at),
    )[0] || null;
}

function compatibleProject(project = {}) {
  const metadata = object(project.metadata);
  const source = text(metadata.selected_assets_source).toUpperCase();
  const current = object(metadata.paid_direction_approval);
  const continuation =
    text(current.scope).toUpperCase() ===
    "CREATIVE_DIRECTION_CONTINUATION_BUDGET";
  const original = originalApproval(metadata, current);
  return source.endsWith("_V5") && continuation && original
    ? { metadata, current, original }
    : null;
}

function operationUsageIds(approval = {}, operation = "") {
  return list(approval.operations)
    .filter((entry) =>
      text(entry?.operation).toUpperCase() === operation,
    )
    .map((entry) => text(entry?.usage_id))
    .filter(Boolean);
}

async function recover(input = {}) {
  const organizationId = text(input.organization_id);
  const projectId = text(input.metadata?.creative_project_id);
  const operation = text(input.metadata?.operation).toUpperCase();
  if (!organizationId || !projectId || !operation) return null;

  const project = await CreativeProjectRuntime.get(projectId);
  if (!project || text(project.organization_id) !== organizationId) return null;

  const compatibility = compatibleProject(project);
  if (!compatibility) return null;

  const usageIds = operationUsageIds(
    compatibility.original,
    operation,
  );
  if (!usageIds.length) return null;

  const key = `${projectId}:${operation}`;
  const cursor = Number(cursors.get(key) || 0);
  const repeatable = operation === "TEMPORAL_SCENE_SHOT_DIRECTION_V1";
  const usageId = repeatable
    ? usageIds[cursor] || null
    : usageIds[usageIds.length - 1];
  if (!usageId) return null;

  const selected = await UsageRuntime.get(usageId);
  if (
    !selected ||
    text(selected.organization_id) !== organizationId ||
    text(selected.status).toUpperCase() !== "SUCCESS" ||
    text(selected.category).toUpperCase() !== "CREATIVE_DIRECTION" ||
    text(selected.metadata?.creative_project_id) !== projectId ||
    text(selected.metadata?.operation).toUpperCase() !== operation ||
    text(selected.metadata?.direction_approval_id) !==
      text(compatibility.original.id) ||
    !Object.keys(object(selected.metadata?.result)).length
  ) {
    throw new Error(
      `CREATIVE_DIRECTION_SANITIZED_RECOVERY_USAGE_INVALID:${usageId}`,
    );
  }

  if (repeatable) cursors.set(key, cursor + 1);

  return serviceResultFromUsage(selected, {
    contract: "CREATIVE_DIRECTION_SANITIZED_ASSET_RECOVERY_V2",
    mode: "ORIGINAL_APPROVAL_USAGE_ID_SEQUENCE",
    original_approval_id: compatibility.original.id,
    continuation_approval_id: compatibility.current.id,
    recovered_usage_id: selected.id,
    operation,
    sequence: repeatable ? cursor + 1 : 1,
    reason:
      "GENERIC_NON_FILE_CONTAINER_REMOVED_WITHOUT_CHANGING_CONCRETE_CREATIVE_EVIDENCE",
    organization_wide_usage_scan_used: false,
    new_provider_execution: false,
    new_customer_charge: false,
  });
}

export function installCreativeDirectionSanitizedAssetRecovery() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;
  const executeWithoutRecovery = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute =
    async function executeWithSanitizedAssetRecovery(input = {}) {
      if (text(input.category).toUpperCase() !== "CREATIVE_DIRECTION") {
        return executeWithoutRecovery(input);
      }

      const recovered = await recover(input);
      return recovered || executeWithoutRecovery(input);
    };
}

installCreativeDirectionSanitizedAssetRecovery();

export const CreativeDirectionSanitizedAssetRecoveryRuntime = {
  installed: true,
};
