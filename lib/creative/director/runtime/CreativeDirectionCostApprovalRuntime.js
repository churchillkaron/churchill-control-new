import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  PricingRuntime,
} from "@/lib/platform/service-runtime/pricing/PricingRuntime";
import {
  UsageRuntime,
} from "@/lib/platform/service-runtime/usage/UsageRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.direction.cost-approval.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validDate(value) {
  const timestamp = Date.parse(text(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function updateApproval(project, approval, patch) {
  const current = await CreativeProjectRuntime.get(project.id);
  return CreativeProjectRuntime.update(project.id, {
    metadata: {
      ...(current?.metadata || project.metadata || {}),
      paid_direction_approval: {
        ...approval,
        ...patch,
      },
    },
  });
}

function approvalFor(project = {}) {
  const approval = object(project.metadata?.paid_direction_approval);
  const approvedAt = validDate(approval.approved_at);
  const expiresAt = validDate(approval.expires_at);
  const now = Date.now();
  const status = text(approval.status).toUpperCase();

  if (
    !text(approval.id) ||
    !text(approval.provider) ||
    !text(approval.pricing_id) ||
    !text(approval.currency) ||
    finite(approval.maximum_customer_price) === null ||
    Number(approval.maximum_customer_price) <= 0
  ) {
    throw new Error("CREATIVE_PAID_DIRECTION_APPROVAL_REQUIRED");
  }

  if (status === "COMPLETED" && text(approval.usage_id)) {
    return { approval, mode: "RECOVER_COMPLETED" };
  }

  if (
    approval.approved !== true ||
    status !== "APPROVED" ||
    approvedAt === null ||
    expiresAt === null ||
    approvedAt > now ||
    expiresAt <= now
  ) {
    throw new Error("CREATIVE_PAID_DIRECTION_APPROVAL_REQUIRED");
  }

  return { approval, mode: "EXECUTE_APPROVED" };
}

function serviceResultFromUsage(usage = {}) {
  const result = object(usage.metadata?.result);
  return {
    success: true,
    pending: false,
    provider: usage.provider || result.provider || null,
    model: usage.metadata?.model || result.model || null,
    pricing: usage.metadata?.settled_pricing || null,
    reservation_pricing: usage.metadata?.reservation_pricing || null,
    usage,
    billing: {
      id: usage.billing_invoice_line_id || usage.invoice_id || null,
      usage,
    },
    settlement: "CHARGED",
    output: result,
  };
}

async function recoverCompleted(approval, project) {
  const usage = await UsageRuntime.get(approval.usage_id);
  if (
    !usage ||
    text(usage.status).toUpperCase() !== "SUCCESS" ||
    text(usage.organization_id) !== text(project.organization_id) ||
    text(usage.category).toUpperCase() !== "CREATIVE_DIRECTION" ||
    !Object.keys(object(usage.metadata?.result)).length
  ) {
    await updateApproval(project, approval, {
      approved: false,
      status: "RECOVERY_FAILED",
      retry_required: true,
      recovery_failed_at: new Date().toISOString(),
    }).catch(() => null);
    throw new Error("CREATIVE_PAID_DIRECTION_RETRY_APPROVAL_REQUIRED");
  }

  return serviceResultFromUsage(usage);
}

async function assertCurrentPricing(approval) {
  const pricing = await PricingRuntime.resolveById({
    pricing_id: approval.pricing_id,
    currency: approval.currency,
    usage: { quantity: 1 },
  });
  const maximum = Number(approval.maximum_customer_price);
  if (
    text(pricing.provider) !== text(approval.provider) ||
    text(pricing.model) !== text(approval.model) ||
    text(pricing.currency).toUpperCase() !== text(approval.currency).toUpperCase() ||
    Number(pricing.customer_price) > maximum
  ) {
    throw new Error("CREATIVE_DIRECTION_APPROVED_PRICING_CHANGED");
  }
  return pricing;
}

export function installCreativeDirectionCostApprovalGate() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;
  const executeWithoutDirectionGate = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute = async function executeWithDirectionGate(input = {}) {
    if (text(input.category).toUpperCase() !== "CREATIVE_DIRECTION") {
      return executeWithoutDirectionGate(input);
    }

    const projectId = text(input.metadata?.creative_project_id);
    if (!projectId) throw new Error("creative_project_id required");
    const project = await CreativeProjectRuntime.get(projectId);
    if (
      !project ||
      text(project.organization_id) !== text(input.organization_id)
    ) {
      throw new Error("Creative project not found");
    }

    const resolved = approvalFor(project);
    if (resolved.mode === "RECOVER_COMPLETED") {
      return recoverCompleted(resolved.approval, project);
    }

    const approval = resolved.approval;
    const pricing = await assertCurrentPricing(approval);
    await updateApproval(project, approval, {
      approved: false,
      status: "EXECUTING",
      attempt_started_at: new Date().toISOString(),
      retry_required: false,
    });

    let result;
    try {
      result = await executeWithoutDirectionGate({
        ...input,
        provider_id: approval.provider,
        input: {
          ...(input.input || {}),
          currency: approval.currency,
        },
        provider_policy: {
          ...(input.provider_policy || {}),
          allowed_providers: [approval.provider],
          preferred_providers: [approval.provider],
          preferred_models: approval.model ? [approval.model] : [],
          selection_weights: {
            preference: 1,
            quality: 0,
            speed: 0,
            reliability: 0,
            cost: 0,
          },
        },
        metadata: {
          ...(input.metadata || {}),
          direction_approval_id: approval.id,
          direction_approved_at: approval.approved_at,
          direction_maximum_customer_price: approval.maximum_customer_price,
          direction_approval_currency: approval.currency,
        },
      });
    } catch (error) {
      await updateApproval(project, approval, {
        approved: false,
        status: "EXECUTION_FAILED",
        retry_required: true,
        execution_error: text(error?.message || error),
        failed_at: new Date().toISOString(),
      }).catch(() => null);
      throw error;
    }

    const charged = finite(
      result?.pricing?.customer_price ??
      result?.reservation_pricing?.customer_price,
    );
    if (
      charged === null ||
      charged > Number(approval.maximum_customer_price) ||
      text(result?.provider) !== text(approval.provider) ||
      text(result?.model) !== text(approval.model) ||
      text(result?.reservation_pricing?.pricing_id || result?.pricing?.pricing_id) !==
        text(approval.pricing_id)
    ) {
      await updateApproval(project, approval, {
        approved: false,
        status: "SETTLEMENT_MISMATCH",
        retry_required: true,
        settled_customer_price: charged,
        failed_at: new Date().toISOString(),
      }).catch(() => null);
      throw new Error("CREATIVE_DIRECTION_APPROVAL_SETTLEMENT_MISMATCH");
    }

    await updateApproval(project, approval, {
      approved: false,
      status: "COMPLETED",
      usage_id: result?.usage?.id || null,
      settled_customer_price: charged,
      settled_currency: pricing.currency,
      completed_at: new Date().toISOString(),
      retry_required: false,
    });

    return result;
  };
}

installCreativeDirectionCostApprovalGate();
