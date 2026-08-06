import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  PricingRuntime,
} from "@/lib/platform/service-runtime/pricing/PricingRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.direction.cost-approval.v2",
);

const APPROVAL_CONTRACT = "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2";

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validDate(value) {
  const timestamp = Date.parse(text(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function operationAllowed(operation, patterns = []) {
  const current = text(operation).toUpperCase();
  return list(patterns).some((patternValue) => {
    const pattern = text(patternValue).toUpperCase();
    if (!pattern) return false;
    if (pattern.endsWith("*")) return current.startsWith(pattern.slice(0, -1));
    return current === pattern;
  });
}

function approvalState(project = {}, operation = "") {
  const approval = object(project.metadata?.paid_direction_approval);
  const approvedAt = validDate(approval.approved_at);
  const expiresAt = validDate(approval.expires_at);
  const now = Date.now();
  const status = text(approval.status).toUpperCase();
  const maximum = finite(approval.maximum_customer_price);
  const spent = Math.max(0, finite(approval.spent_customer_price) || 0);
  const remaining = maximum === null
    ? null
    : Number(Math.max(0, maximum - spent).toFixed(6));

  if (approval.contract !== APPROVAL_CONTRACT) {
    throw new Error("CREATIVE_DIRECTION_BUDGET_APPROVAL_REQUIRED");
  }
  if (
    !text(approval.id) ||
    !text(approval.provider) ||
    !text(approval.pricing_id) ||
    !text(approval.currency) ||
    maximum === null ||
    maximum <= 0 ||
    finite(approval.maximum_per_call_customer_price) === null ||
    Number(approval.maximum_per_call_customer_price) <= 0 ||
    !Number.isFinite(Number(approval.maximum_calls)) ||
    Number(approval.maximum_calls) <= 0
  ) {
    throw new Error("CREATIVE_DIRECTION_BUDGET_APPROVAL_INVALID");
  }
  if (
    approval.approved !== true ||
    !["APPROVED", "IN_PROGRESS"].includes(status) ||
    approvedAt === null ||
    expiresAt === null ||
    approvedAt > now ||
    expiresAt <= now
  ) {
    throw new Error("CREATIVE_DIRECTION_BUDGET_APPROVAL_REQUIRED");
  }
  if (
    text(approval.command_identity) !== text(project.metadata?.command_identity)
  ) {
    throw new Error("CREATIVE_DIRECTION_BUDGET_COMMAND_MISMATCH");
  }
  if (!operationAllowed(operation, approval.allowed_operations)) {
    throw new Error(`CREATIVE_DIRECTION_OPERATION_NOT_APPROVED:${operation}`);
  }
  if (remaining === null || remaining <= 0) {
    throw new Error("CREATIVE_DIRECTION_BUDGET_EXHAUSTED");
  }
  if (Number(approval.call_count || 0) >= Number(approval.maximum_calls)) {
    throw new Error("CREATIVE_DIRECTION_CALL_BUDGET_EXHAUSTED");
  }

  return { approval, maximum, spent, remaining };
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

async function currentPricing(approval) {
  const pricing = await PricingRuntime.resolveById({
    pricing_id: approval.pricing_id,
    currency: approval.currency,
    usage: { quantity: 1 },
  });
  if (
    text(pricing.provider) !== text(approval.provider) ||
    text(pricing.model) !== text(approval.model) ||
    text(pricing.currency).toUpperCase() !== text(approval.currency).toUpperCase() ||
    Number(pricing.customer_price) >
      Number(approval.maximum_per_call_customer_price)
  ) {
    throw new Error("CREATIVE_DIRECTION_APPROVED_PRICING_CHANGED");
  }
  return pricing;
}

function resultPrice(result = {}) {
  return finite(
    result?.pricing?.customer_price ??
    result?.reservation_pricing?.customer_price ??
    result?.usage?.customer_price ??
    result?.billing?.usage?.customer_price,
  );
}

function resultPricingId(result = {}) {
  return text(
    result?.reservation_pricing?.pricing_id ||
    result?.pricing?.pricing_id ||
    result?.usage?.pricing_id,
  );
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
    const operation = text(input.metadata?.operation).toUpperCase();
    if (!projectId) throw new Error("creative_project_id required");
    if (!operation) throw new Error("CREATIVE_DIRECTION_OPERATION_REQUIRED");

    const project = await CreativeProjectRuntime.get(projectId);
    if (
      !project ||
      text(project.organization_id) !== text(input.organization_id)
    ) {
      throw new Error("Creative project not found");
    }

    const state = approvalState(project, operation);
    const approval = state.approval;
    const pricing = await currentPricing(approval);
    if (Number(pricing.customer_price) > state.remaining) {
      throw new Error(
        `CREATIVE_DIRECTION_BUDGET_INSUFFICIENT:${operation}:${pricing.customer_price}:${state.remaining}`,
      );
    }

    await updateApproval(project, approval, {
      status: "IN_PROGRESS",
      last_operation_started: operation,
      last_attempt_started_at: new Date().toISOString(),
      retry_required: false,
    });

    const incomingGuard =
      object(input.cost_guard || input.costGuard);
    const incomingMaximum = finite(
      incomingGuard.maximum_customer_price,
    );
    const approvedPerCallMaximum = Number(
      approval.maximum_per_call_customer_price,
    );
    const maximumForCall = Math.min(
      state.remaining,
      approvedPerCallMaximum,
      incomingMaximum === null
        ? Number.POSITIVE_INFINITY
        : incomingMaximum,
    );

    let result;
    try {
      result = await executeWithoutDirectionGate({
        ...input,
        provider_id: approval.provider,
        input: {
          ...(input.input || {}),
          currency: approval.currency,
        },
        cost_guard: {
          ...incomingGuard,
          contract: "SERVICE_EXECUTION_COST_GUARD_V1",
          maximum_customer_price: maximumForCall,
          currency: approval.currency,
          reference:
            incomingGuard.reference ||
            `${approval.id}:${Number(approval.call_count || 0) + 1}:${operation}`,
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
          direction_approval_contract: APPROVAL_CONTRACT,
          direction_approval_id: approval.id,
          direction_approved_at: approval.approved_at,
          direction_budget_maximum_customer_price:
            approval.maximum_customer_price,
          direction_budget_remaining_before_call: state.remaining,
          direction_approval_currency: approval.currency,
        },
      });
    } catch (error) {
      await updateApproval(project, approval, {
        approved: true,
        status: "APPROVED",
        retry_required: true,
        last_failed_operation: operation,
        execution_error: text(error?.message || error),
        failed_at: new Date().toISOString(),
      }).catch(() => null);
      throw error;
    }

    const charged = resultPrice(result);
    const pricingId = resultPricingId(result);
    if (
      charged === null ||
      charged < 0 ||
      charged > Number(approval.maximum_per_call_customer_price) ||
      charged > state.remaining ||
      text(result?.provider) !== text(approval.provider) ||
      (text(approval.model) && text(result?.model) !== text(approval.model)) ||
      pricingId !== text(approval.pricing_id)
    ) {
      await updateApproval(project, approval, {
        approved: false,
        status: "SETTLEMENT_MISMATCH",
        retry_required: true,
        last_failed_operation: operation,
        settled_customer_price: charged,
        settled_pricing_id: pricingId || null,
        failed_at: new Date().toISOString(),
      }).catch(() => null);
      throw new Error("CREATIVE_DIRECTION_BUDGET_SETTLEMENT_MISMATCH");
    }

    const spent = Number((state.spent + charged).toFixed(6));
    const callCount = Number(approval.call_count || 0) + 1;
    const remaining = Number(Math.max(0, state.maximum - spent).toFixed(6));
    const completed =
      remaining <= 0 || callCount >= Number(approval.maximum_calls);
    const operations = [
      ...list(approval.operations),
      {
        sequence: callCount,
        operation,
        request_hash: input.metadata?.creative_direction_request_hash || null,
        usage_id: result?.usage?.id || null,
        customer_price: charged,
        currency: approval.currency,
        provider: result?.provider || null,
        model: result?.model || null,
        pricing_id: pricingId || null,
        completed_at: new Date().toISOString(),
      },
    ];

    await updateApproval(project, approval, {
      approved: !completed,
      status: completed ? "COMPLETED" : "IN_PROGRESS",
      call_count: callCount,
      spent_customer_price: spent,
      remaining_customer_price: remaining,
      operations,
      last_completed_operation: operation,
      last_usage_id: result?.usage?.id || null,
      completed_at: completed ? new Date().toISOString() : null,
      retry_required: false,
      execution_error: null,
    });

    return result;
  };
}

installCreativeDirectionCostApprovalGate();
