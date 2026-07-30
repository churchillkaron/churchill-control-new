import {
  AsyncLocalStorage,
} from "node:async_hooks";
import crypto from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  CreativeUniversalTemporalDirectionRuntime,
} from "@/lib/creative/director/runtime/CreativeUniversalTemporalDirectionRuntime";

const DIRECTION_FLAG = Symbol.for(
  "avantiqo.creative-reasoning-budget-direction.v1",
);
const EXECUTION_FLAG = Symbol.for(
  "avantiqo.creative-reasoning-budget-execution.v1",
);
const storage = new AsyncLocalStorage();

const TECHNICAL_LIMITS = Object.freeze({
  maximum_calls: 32,
  maximum_requested_output_tokens: 240000,
  maximum_single_call_output_tokens: 20000,
  maximum_prompt_characters: 1000000,
  maximum_total_prompt_characters: 4000000,
});

const DEFAULT_LIMITS = Object.freeze({
  maximum_calls: 24,
  maximum_requested_output_tokens: 180000,
  maximum_single_call_output_tokens: 20000,
  maximum_prompt_characters: 500000,
  maximum_total_prompt_characters: 2000000,
});

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

function positiveInteger(value, fallback, maximum) {
  const number = finite(value);
  if (number === null) return fallback;
  if (number <= 0) throw new Error("CREATIVE_REASONING_BUDGET_POSITIVE_LIMIT_REQUIRED");
  return Math.min(Math.floor(number), maximum);
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finite(value);
    if (number !== null) return number;
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return null;
}

function budgetSources(input = {}) {
  const project = object(input.project);
  const mission = object(input.mission);
  const brief = object(input.brief);
  const projectBudget = object(project.budget_profile);
  const missionBudget = object(mission.budget_profile);
  return [
    object(input.reasoning_budget || input.reasoningBudget),
    object(input.cost_policy?.creative_direction),
    object(input.costPolicy?.creativeDirection),
    object(brief.metadata?.creative_reasoning_budget),
    object(brief.metadata?.creative_direction_budget),
    object(mission.metadata?.creative_reasoning_budget),
    object(project.metadata?.creative_reasoning_budget),
    object(projectBudget.creative_direction),
    object(projectBudget.reasoning),
    projectBudget,
    object(missionBudget.creative_direction),
    object(missionBudget.reasoning),
    missionBudget,
  ];
}

function valueFromSources(sources, keys = []) {
  for (const source of sources) {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
        return source[key];
      }
    }
  }
  return null;
}

function resolveBudget(input = {}) {
  const sources = budgetSources(input);
  const project = object(input.project);
  const mission = object(input.mission);
  const maximumCustomerPrice = firstFinite(valueFromSources(sources, [
    "maximum_customer_price",
    "max_customer_price",
    "customer_price_ceiling",
    "reasoning_cost_ceiling",
    "planning_cost_ceiling",
    "max_planning_cost",
  ]));
  if (maximumCustomerPrice !== null && maximumCustomerPrice < 0) {
    throw new Error("CREATIVE_REASONING_BUDGET_CUSTOMER_PRICE_INVALID");
  }

  const currency = firstText(
    valueFromSources(sources, ["currency", "budget_currency"]),
    project.currency,
    project.metadata?.currency,
    mission.currency,
    mission.metadata?.currency,
  );

  const resolved = {
    contract: "CREATIVE_REASONING_BUDGET_V1",
    budget_id: firstText(
      valueFromSources(sources, ["id", "budget_id", "profile_id"]),
      project.budget_profile?.id,
      mission.budget_profile?.id,
    ),
    project_id: project.id || null,
    mission_id: mission.id || mission.creative_mission_id || null,
    maximum_calls: positiveInteger(
      valueFromSources(sources, ["maximum_calls", "max_calls"]),
      DEFAULT_LIMITS.maximum_calls,
      TECHNICAL_LIMITS.maximum_calls,
    ),
    maximum_requested_output_tokens: positiveInteger(
      valueFromSources(sources, [
        "maximum_requested_output_tokens",
        "max_output_tokens_total",
        "maximum_output_tokens",
      ]),
      DEFAULT_LIMITS.maximum_requested_output_tokens,
      TECHNICAL_LIMITS.maximum_requested_output_tokens,
    ),
    maximum_single_call_output_tokens: positiveInteger(
      valueFromSources(sources, [
        "maximum_single_call_output_tokens",
        "max_output_tokens_per_call",
      ]),
      DEFAULT_LIMITS.maximum_single_call_output_tokens,
      TECHNICAL_LIMITS.maximum_single_call_output_tokens,
    ),
    maximum_prompt_characters: positiveInteger(
      valueFromSources(sources, [
        "maximum_prompt_characters",
        "max_prompt_characters",
      ]),
      DEFAULT_LIMITS.maximum_prompt_characters,
      TECHNICAL_LIMITS.maximum_prompt_characters,
    ),
    maximum_total_prompt_characters: positiveInteger(
      valueFromSources(sources, [
        "maximum_total_prompt_characters",
        "max_total_prompt_characters",
      ]),
      DEFAULT_LIMITS.maximum_total_prompt_characters,
      TECHNICAL_LIMITS.maximum_total_prompt_characters,
    ),
    maximum_customer_price: maximumCustomerPrice,
    currency: currency ? currency.toUpperCase() : null,
    call_count: 0,
    requested_output_tokens: 0,
    prompt_characters: 0,
    customer_price_spent: 0,
    supplier_cost_spent: 0,
    operations: [],
    queue: Promise.resolve(),
  };

  resolved.budget_hash = crypto.createHash("sha256").update(JSON.stringify({
    contract: resolved.contract,
    budget_id: resolved.budget_id,
    project_id: resolved.project_id,
    mission_id: resolved.mission_id,
    maximum_calls: resolved.maximum_calls,
    maximum_requested_output_tokens:
      resolved.maximum_requested_output_tokens,
    maximum_single_call_output_tokens:
      resolved.maximum_single_call_output_tokens,
    maximum_prompt_characters: resolved.maximum_prompt_characters,
    maximum_total_prompt_characters:
      resolved.maximum_total_prompt_characters,
    maximum_customer_price: resolved.maximum_customer_price,
    currency: resolved.currency,
  })).digest("hex");

  return resolved;
}

function promptCharacters(input = {}) {
  const prompt = input.input?.prompt ?? input.input?.input ?? input.input?.messages ?? "";
  return typeof prompt === "string"
    ? prompt.length
    : JSON.stringify(prompt || "").length;
}

function requestedOutputTokens(input = {}) {
  return positiveInteger(
    input.input?.max_output_tokens ?? input.input?.maxOutputTokens ?? 1,
    1,
    TECHNICAL_LIMITS.maximum_single_call_output_tokens,
  );
}

function resultPrice(result = {}) {
  const pricing =
    result.pricing ||
    result.reservation_pricing ||
    result.billing?.usage?.metadata?.settled_pricing ||
    result.usage?.metadata?.settled_pricing ||
    {};
  return {
    customer_price: firstFinite(
      pricing.customer_price,
      result.billing?.usage?.customer_price,
      result.usage?.customer_price,
    ) ?? 0,
    supplier_cost: firstFinite(
      pricing.supplier_cost,
      result.billing?.usage?.supplier_cost,
      result.usage?.supplier_cost,
    ) ?? 0,
    currency: firstText(
      pricing.currency,
      result.billing?.usage?.currency,
      result.usage?.currency,
    ),
    pricing_id: pricing.pricing_id || result.usage?.pricing_id || null,
    provider: result.provider || pricing.provider || null,
    model: result.model || pricing.model || null,
  };
}

function remainingCustomerPrice(budget) {
  if (budget.maximum_customer_price === null) return null;
  return Math.max(
    0,
    Number((
      budget.maximum_customer_price - budget.customer_price_spent
    ).toFixed(6)),
  );
}

function preflight(budget, input = {}) {
  const operation = text(input.metadata?.operation) || "CREATIVE_REASONING";
  const tokens = requestedOutputTokens(input);
  const characters = promptCharacters(input);

  if (tokens > budget.maximum_single_call_output_tokens) {
    throw new Error(
      `CREATIVE_REASONING_SINGLE_CALL_TOKEN_BUDGET_EXCEEDED:${operation}:${tokens}:${budget.maximum_single_call_output_tokens}`,
    );
  }
  if (budget.call_count + 1 > budget.maximum_calls) {
    throw new Error(
      `CREATIVE_REASONING_CALL_BUDGET_EXCEEDED:${operation}:${budget.call_count + 1}:${budget.maximum_calls}`,
    );
  }
  if (
    budget.requested_output_tokens + tokens >
    budget.maximum_requested_output_tokens
  ) {
    throw new Error(
      `CREATIVE_REASONING_TOKEN_BUDGET_EXCEEDED:${operation}:${budget.requested_output_tokens + tokens}:${budget.maximum_requested_output_tokens}`,
    );
  }
  if (characters > budget.maximum_prompt_characters) {
    throw new Error(
      `CREATIVE_REASONING_PROMPT_SIZE_EXCEEDED:${operation}:${characters}:${budget.maximum_prompt_characters}`,
    );
  }
  if (
    budget.prompt_characters + characters >
    budget.maximum_total_prompt_characters
  ) {
    throw new Error(
      `CREATIVE_REASONING_TOTAL_PROMPT_BUDGET_EXCEEDED:${operation}:${budget.prompt_characters + characters}:${budget.maximum_total_prompt_characters}`,
    );
  }

  const remaining = remainingCustomerPrice(budget);
  if (remaining !== null && remaining <= 0) {
    throw new Error(
      `CREATIVE_REASONING_CUSTOMER_PRICE_BUDGET_EXHAUSTED:${operation}`,
    );
  }

  budget.call_count += 1;
  budget.requested_output_tokens += tokens;
  budget.prompt_characters += characters;

  return {
    operation,
    sequence: budget.call_count,
    requested_output_tokens: tokens,
    prompt_characters: characters,
    remaining_customer_price_before_call: remaining,
  };
}

function recordResult(budget, call, result = {}) {
  const price = resultPrice(result);
  if (budget.currency && price.currency && price.currency.toUpperCase() !== budget.currency) {
    throw new Error(
      `CREATIVE_REASONING_BUDGET_CURRENCY_MISMATCH:${price.currency}:${budget.currency}`,
    );
  }
  if (!budget.currency && price.currency) budget.currency = price.currency.toUpperCase();

  budget.customer_price_spent = Number((
    budget.customer_price_spent + price.customer_price
  ).toFixed(6));
  budget.supplier_cost_spent = Number((
    budget.supplier_cost_spent + price.supplier_cost
  ).toFixed(6));

  if (
    budget.maximum_customer_price !== null &&
    budget.customer_price_spent > budget.maximum_customer_price
  ) {
    throw new Error(
      `CREATIVE_REASONING_CUSTOMER_PRICE_BUDGET_EXCEEDED:${budget.customer_price_spent}:${budget.maximum_customer_price}`,
    );
  }

  budget.operations.push({
    ...call,
    customer_price: price.customer_price,
    supplier_cost: price.supplier_cost,
    currency: price.currency || budget.currency,
    pricing_id: price.pricing_id,
    provider: price.provider,
    model: price.model,
    remaining_customer_price_after_call: remainingCustomerPrice(budget),
    completed: true,
  });
}

function summary(budget) {
  return {
    contract: budget.contract,
    budget_id: budget.budget_id,
    budget_hash: budget.budget_hash,
    project_id: budget.project_id,
    mission_id: budget.mission_id,
    limits: {
      maximum_calls: budget.maximum_calls,
      maximum_requested_output_tokens:
        budget.maximum_requested_output_tokens,
      maximum_single_call_output_tokens:
        budget.maximum_single_call_output_tokens,
      maximum_prompt_characters: budget.maximum_prompt_characters,
      maximum_total_prompt_characters:
        budget.maximum_total_prompt_characters,
      maximum_customer_price: budget.maximum_customer_price,
      currency: budget.currency,
    },
    usage: {
      call_count: budget.call_count,
      requested_output_tokens: budget.requested_output_tokens,
      prompt_characters: budget.prompt_characters,
      customer_price_spent: budget.customer_price_spent,
      supplier_cost_spent: budget.supplier_cost_spent,
      remaining_customer_price: remainingCustomerPrice(budget),
    },
    operations: budget.operations,
    serialized_execution: true,
    parallel_wallet_reservations_prohibited: true,
    passed: true,
  };
}

function installExecutionBudget() {
  if (ServiceExecutionRuntime[EXECUTION_FLAG]) return;
  const executeWithoutBudget = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, EXECUTION_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute = async function executeWithReasoningBudget(input = {}) {
    const budget = storage.getStore();
    const governed =
      budget &&
      input.service_id === "ai.reasoning.execute" &&
      input.category === "CREATIVE_DIRECTION";
    if (!governed) return executeWithoutBudget(input);

    const executeOne = async () => {
      const call = preflight(budget, input);
      const remaining = call.remaining_customer_price_before_call;
      const result = await executeWithoutBudget({
        ...input,
        cost_guard: remaining !== null || budget.currency
          ? {
              contract: "SERVICE_EXECUTION_COST_GUARD_V1",
              maximum_customer_price: remaining,
              currency: budget.currency,
              reference: `${budget.budget_hash}:${call.sequence}:${call.operation}`,
            }
          : null,
        metadata: {
          ...object(input.metadata),
          creative_reasoning_budget_contract: budget.contract,
          creative_reasoning_budget_hash: budget.budget_hash,
          creative_reasoning_budget_sequence: call.sequence,
          creative_reasoning_budget_operation: call.operation,
        },
      });
      recordResult(budget, call, result);
      return result;
    };

    const queued = budget.queue.then(executeOne, executeOne);
    budget.queue = queued.catch(() => null);
    return queued;
  };
}

function installDirectionBudget() {
  if (CreativeUniversalTemporalDirectionRuntime[DIRECTION_FLAG]) return;
  const createWithoutBudget = CreativeUniversalTemporalDirectionRuntime.create.bind(
    CreativeUniversalTemporalDirectionRuntime,
  );

  Object.defineProperty(CreativeUniversalTemporalDirectionRuntime, DIRECTION_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeUniversalTemporalDirectionRuntime.create = async function createWithReasoningBudget(input = {}) {
    if (storage.getStore()) return createWithoutBudget(input);
    const budget = resolveBudget(input);
    return storage.run(budget, async () => {
      const directed = await createWithoutBudget(input);
      await budget.queue;
      const evidence = summary(budget);
      return {
        ...directed,
        reasoning_budget: evidence,
        plan: {
          ...object(directed.plan),
          production: {
            ...object(directed.plan?.production),
            reasoning_budget_contract: evidence.contract,
            reasoning_budget_hash: evidence.budget_hash,
            reasoning_budget_passed: true,
            reasoning_calls_used: evidence.usage.call_count,
            reasoning_customer_price_spent:
              evidence.usage.customer_price_spent,
            reasoning_currency: evidence.limits.currency,
          },
          validation_summary: {
            ...object(directed.plan?.validation_summary),
            reasoning_budget_passed: true,
            reasoning_budget_hash: evidence.budget_hash,
            reasoning_calls_used: evidence.usage.call_count,
          },
        },
      };
    });
  };
}

installExecutionBudget();
installDirectionBudget();

export const CreativeReasoningBudgetRuntime = {
  installed: true,
  resolveBudget,
  summary,
  technical_limits: TECHNICAL_LIMITS,
  default_limits: DEFAULT_LIMITS,
};
