import { PricingRuntime } from "@/lib/platform/service-runtime/pricing/PricingRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

export const CREATIVE_PREPRODUCTION_SPEND_APPROVAL_CONTRACT =
  "CREATIVE_PREPRODUCTION_SPECIALIST_BUDGET_APPROVAL_V1";

const APPROVAL_KEY = "paid_preproduction_specialist_approval";
const QUEUE_BY_PROJECT = new Map();
const INPUT_TOKEN_HEADROOM = 1.15;
const BUDGET_TOKEN_SAFETY_RATIO = 0.88;
const MINIMUM_BOUNDED_OUTPUT_TOKENS = 1024;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
function operationAllowed(operation, patterns = []) {
  const current = text(operation).toUpperCase();
  return list(patterns).some((value) => {
    const pattern = text(value).toUpperCase();
    if (!pattern) return false;
    return pattern.endsWith("*") ? current.startsWith(pattern.slice(0, -1)) : current === pattern;
  });
}
function estimatedUsage(input = {}) {
  const prompt = text(input.prompt);
  const heuristic = Math.max(1, Math.ceil(prompt.length / 2.5));
  return {
    quantity: 1,
    input_tokens: Math.max(heuristic, Math.ceil(heuristic * INPUT_TOKEN_HEADROOM)),
    output_tokens: Math.max(1, Math.ceil(finite(input.max_output_tokens ?? input.maxOutputTokens) || 12000)),
    estimated: true,
  };
}
async function boundedUsage({ approval, requestedUsage, maximumForCall }) {
  const safeMaximum = Number((maximumForCall * BUDGET_TOKEN_SAFETY_RATIO).toFixed(6));
  const priceFor = (usage) => PricingRuntime.resolveById({
    pricing_id: approval.pricing_id,
    currency: approval.currency,
    usage,
  });
  const requestedPricing = await priceFor(requestedUsage);
  if (Number(requestedPricing.customer_price) <= safeMaximum) {
    return { usage: requestedUsage, pricing: requestedPricing, capped: false };
  }
  let low = 1;
  let high = requestedUsage.output_tokens;
  let best = 0;
  let bestPricing = null;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const usage = { ...requestedUsage, output_tokens: mid };
    const pricing = await priceFor(usage);
    if (Number(pricing.customer_price) <= safeMaximum) {
      best = mid;
      bestPricing = pricing;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (best < MINIMUM_BOUNDED_OUTPUT_TOKENS || !bestPricing) {
    throw new Error(`CREATIVE_PREPRODUCTION_SPECIALIST_APPROVED_CALL_TOO_SMALL:${maximumForCall}:${best}`);
  }
  return {
    usage: { ...requestedUsage, output_tokens: best },
    pricing: bestPricing,
    capped: true,
  };
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
  return text(result?.reservation_pricing?.pricing_id || result?.pricing?.pricing_id || result?.usage?.pricing_id);
}
function activeApproval(project = {}, operation = "") {
  const approval = object(project.metadata?.[APPROVAL_KEY]);
  if (approval.contract !== CREATIVE_PREPRODUCTION_SPEND_APPROVAL_CONTRACT) {
    throw new Error("CREATIVE_PREPRODUCTION_SPECIALIST_BUDGET_APPROVAL_REQUIRED");
  }
  const status = text(approval.status).toUpperCase();
  const approvedAt = Date.parse(text(approval.approved_at));
  const expiresAt = Date.parse(text(approval.expires_at));
  const now = Date.now();
  const maximum = finite(approval.maximum_customer_price);
  const spent = Math.max(0, finite(approval.spent_customer_price) || 0);
  const remaining = maximum === null ? null : Number(Math.max(0, maximum - spent).toFixed(6));
  if (
    approval.approved !== true ||
    !["APPROVED", "IN_PROGRESS"].includes(status) ||
    !Number.isFinite(approvedAt) || approvedAt > now ||
    (!Number.isFinite(expiresAt) || (expiresAt <= now && status !== "IN_PROGRESS"))
  ) throw new Error(`CREATIVE_PREPRODUCTION_SPECIALIST_BUDGET_APPROVAL_REQUIRED:${operation}`);
  if (
    !text(approval.id) || !text(approval.provider) || !text(approval.pricing_id) ||
    !text(approval.currency) || maximum === null || maximum <= 0 ||
    finite(approval.maximum_per_call_customer_price) === null || Number(approval.maximum_per_call_customer_price) <= 0 ||
    !Number.isInteger(Number(approval.maximum_calls)) || Number(approval.maximum_calls) <= 0
  ) throw new Error("CREATIVE_PREPRODUCTION_SPECIALIST_BUDGET_APPROVAL_INVALID");
  if (text(approval.command_identity) !== text(project.metadata?.command_identity)) {
    throw new Error("CREATIVE_PREPRODUCTION_SPECIALIST_COMMAND_MISMATCH");
  }
  if (!operationAllowed(operation, approval.allowed_operations)) {
    throw new Error(`CREATIVE_PREPRODUCTION_SPECIALIST_OPERATION_NOT_APPROVED:${operation}`);
  }
  if (approval.media_generation_authorized === true || approval.publication_authorized === true) {
    throw new Error("CREATIVE_PREPRODUCTION_SPECIALIST_AUTHORITY_EXPANSION_FORBIDDEN");
  }
  if (remaining === null || remaining <= 0) throw new Error("CREATIVE_PREPRODUCTION_SPECIALIST_BUDGET_EXHAUSTED");
  if (Number(approval.call_count || 0) >= Number(approval.maximum_calls)) {
    throw new Error("CREATIVE_PREPRODUCTION_SPECIALIST_CALL_BUDGET_EXHAUSTED");
  }
  return { approval, maximum, spent, remaining };
}
async function persist(project, approval, patch) {
  const current = await CreativeProjectRuntime.get(project.id);
  const currentApproval = object(current?.metadata?.[APPROVAL_KEY] || approval);
  return CreativeProjectRuntime.update(project.id, {
    metadata: {
      ...(current?.metadata || project.metadata || {}),
      [APPROVAL_KEY]: { ...currentApproval, ...patch },
    },
  });
}
function enqueue(projectId, execute) {
  const key = text(projectId);
  const prior = QUEUE_BY_PROJECT.get(key) || Promise.resolve();
  const current = prior.catch(() => null).then(execute);
  const tail = current.catch(() => null).finally(() => {
    if (QUEUE_BY_PROJECT.get(key) === tail) QUEUE_BY_PROJECT.delete(key);
  });
  QUEUE_BY_PROJECT.set(key, tail);
  return current;
}

export async function executeApprovedPreproductionReasoning({
  organization_id,
  creative_project_id,
  operation,
  execution_input = {},
  execution_runtime,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!text(operation)) throw new Error("CREATIVE_PREPRODUCTION_SPECIALIST_OPERATION_REQUIRED");
  if (!execution_runtime?.execute) throw new Error("CREATIVE_PREPRODUCTION_SPECIALIST_EXECUTION_RUNTIME_REQUIRED");

  return enqueue(creative_project_id, async () => {
    const project = await CreativeProjectRuntime.get(creative_project_id);
    if (!project || text(project.organization_id) !== text(organization_id)) throw new Error("Creative project not found");
    const state = activeApproval(project, operation);
    const approval = state.approval;
    const requestedUsage = estimatedUsage(execution_input.input || {});
    const incomingMaximum = finite(execution_input.cost_guard?.maximum_customer_price);
    const maximumForCall = Math.min(
      state.remaining,
      Number(approval.maximum_per_call_customer_price),
      incomingMaximum === null ? Number.POSITIVE_INFINITY : incomingMaximum,
    );
    const bounded = await boundedUsage({ approval, requestedUsage, maximumForCall });
    const usage = bounded.usage;
    const pricing = bounded.pricing;
    await persist(project, approval, {
      status: "IN_PROGRESS",
      last_operation_started: text(operation).toUpperCase(),
      last_attempt_started_at: new Date().toISOString(),
      retry_required: false,
    });

    let result;
    try {
      result = await execution_runtime.execute({
        ...execution_input,
        organization_id,
        service_id: approval.capability || execution_input.service_id || "ai.reasoning.execute",
        provider_id: approval.provider,
        input: {
          ...(execution_input.input || {}),
          max_output_tokens: usage.output_tokens,
          currency: approval.currency,
        },
        provider_policy: {
          ...(execution_input.provider_policy || {}),
          allowed_providers: [approval.provider],
          preferred_providers: [approval.provider],
          preferred_models: [approval.model].filter(Boolean),
          external_fallback_allowed: false,
          allow_owned_reasoning_fallback: false,
        },
        cost_guard: {
          ...(execution_input.cost_guard || {}),
          contract: "SERVICE_EXECUTION_COST_GUARD_V1",
          maximum_customer_price: maximumForCall,
          currency: approval.currency,
          estimated_input_tokens: usage.input_tokens,
          estimated_output_tokens: usage.output_tokens,
          estimated_quantity: 1,
          reference: `${approval.id}:${Number(approval.call_count || 0) + 1}:${text(operation).toUpperCase()}`,
        },
        metadata: {
          ...(execution_input.metadata || {}),
          operation: text(operation).toUpperCase(),
          creative_project_id,
          preproduction_specialist_approval_contract: CREATIVE_PREPRODUCTION_SPEND_APPROVAL_CONTRACT,
          preproduction_specialist_approval_id: approval.id,
          preproduction_specialist_budget_remaining_before_call: state.remaining,
          preproduction_specialist_budget_token_cap_applied: bounded.capped,
          preproduction_specialist_budget_max_output_tokens: usage.output_tokens,
          media_generation_allowed: false,
          publication_authorized: false,
        },
      });
    } catch (error) {
      await persist(project, approval, {
        approved: true,
        status: "APPROVED",
        retry_required: true,
        last_failed_operation: text(operation).toUpperCase(),
        execution_error: text(error?.message || error),
        failed_at: new Date().toISOString(),
      }).catch(() => null);
      throw error;
    }

    const charged = resultPrice(result);
    const pricingId = resultPricingId(result);
    const allowedModels = list(approval.allowed_models).map(text).filter(Boolean);
    const allowedPricingIds = list(approval.allowed_pricing_ids).map(text).filter(Boolean);
    if (
      charged === null || charged < 0 || charged > maximumForCall ||
      text(result?.provider) !== text(approval.provider) ||
      (allowedModels.length && !allowedModels.includes(text(result?.model))) ||
      (allowedPricingIds.length && !allowedPricingIds.includes(pricingId))
    ) {
      await persist(project, approval, {
        approved: false,
        status: "SETTLEMENT_MISMATCH",
        retry_required: true,
        settled_customer_price: charged,
        settled_pricing_id: pricingId || null,
        failed_at: new Date().toISOString(),
      }).catch(() => null);
      throw new Error("CREATIVE_PREPRODUCTION_SPECIALIST_BUDGET_SETTLEMENT_MISMATCH");
    }

    const spent = Number((state.spent + charged).toFixed(6));
    const callCount = Number(approval.call_count || 0) + 1;
    const remaining = Number(Math.max(0, state.maximum - spent).toFixed(6));
    const completed = remaining <= 0 || callCount >= Number(approval.maximum_calls);
    await persist(project, approval, {
      approved: !completed,
      status: completed ? "COMPLETED" : "IN_PROGRESS",
      call_count: callCount,
      spent_customer_price: spent,
      remaining_customer_price: remaining,
      operations: [
        ...list(approval.operations),
        {
          sequence: callCount,
          operation: text(operation).toUpperCase(),
          usage_id: result?.usage?.id || null,
          customer_price: charged,
          currency: approval.currency,
          provider: result?.provider || null,
          model: result?.model || null,
          pricing_id: pricingId || null,
          completed_at: new Date().toISOString(),
        },
      ],
      last_completed_operation: text(operation).toUpperCase(),
      last_usage_id: result?.usage?.id || null,
      completed_at: completed ? new Date().toISOString() : null,
      retry_required: false,
      execution_error: null,
    });
    return result;
  });
}

export const CreativePreproductionSpendApprovalRuntime = Object.freeze({
  contract: CREATIVE_PREPRODUCTION_SPEND_APPROVAL_CONTRACT,
  execute: executeApprovedPreproductionReasoning,
});
