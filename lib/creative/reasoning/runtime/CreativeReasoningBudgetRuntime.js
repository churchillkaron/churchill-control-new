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
  "avantiqo.creative-reasoning-budget-direction.v2",
);
const EXECUTION_FLAG = Symbol.for(
  "avantiqo.creative-reasoning-budget-execution.v2",
);
const storage = new AsyncLocalStorage();

const TECHNICAL_MAXIMUM_CALLS = 32;
const TECHNICAL_MAXIMUM_SINGLE_CALL_OUTPUT_TOKENS = 20000;
const TECHNICAL_MAXIMUM_PROMPT_CHARACTERS = 1000000;

const TECHNICAL_LIMITS = Object.freeze({
  maximum_calls: TECHNICAL_MAXIMUM_CALLS,
  maximum_requested_output_tokens:
    TECHNICAL_MAXIMUM_CALLS *
    TECHNICAL_MAXIMUM_SINGLE_CALL_OUTPUT_TOKENS,
  maximum_single_call_output_tokens:
    TECHNICAL_MAXIMUM_SINGLE_CALL_OUTPUT_TOKENS,
  maximum_prompt_characters: TECHNICAL_MAXIMUM_PROMPT_CHARACTERS,
  maximum_total_prompt_characters:
    TECHNICAL_MAXIMUM_CALLS * TECHNICAL_MAXIMUM_PROMPT_CHARACTERS,
});

const DEFAULT_MAXIMUM_CALLS = 24;
const DEFAULT_MAXIMUM_SINGLE_CALL_OUTPUT_TOKENS = 20000;
const DEFAULT_MAXIMUM_PROMPT_CHARACTERS = 500000;

const DEFAULT_LIMITS = Object.freeze({
  maximum_calls: DEFAULT_MAXIMUM_CALLS,
  maximum_requested_output_tokens:
    DEFAULT_MAXIMUM_CALLS * DEFAULT_MAXIMUM_SINGLE_CALL_OUTPUT_TOKENS,
  maximum_single_call_output_tokens:
    DEFAULT_MAXIMUM_SINGLE_CALL_OUTPUT_TOKENS,
  maximum_prompt_characters: DEFAULT_MAXIMUM_PROMPT_CHARACTERS,
  maximum_total_prompt_characters:
    DEFAULT_MAXIMUM_CALLS * DEFAULT_MAXIMUM_PROMPT_CHARACTERS,
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

function positiveInteger(value, fallback, maximum, label) {
  const number = finite(value);
  if (number === null) return fallback;
  if (number <= 0) {
    throw new Error(
      `CREATIVE_REASONING_BUDGET_POSITIVE_LIMIT_REQUIRED:${label}`,
    );
  }
  const normalized = Math.floor(number);
  if (normalized > maximum) {
    throw new Error(
      `CREATIVE_REASONING_BUDGET_TECHNICAL_LIMIT_EXCEEDED:` +
      `${label}:${normalized}:${maximum}`,
    );
  }
  return normalized;
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

function firstBoolean(...values) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
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
      if (
        source[key] !== undefined &&
        source[key] !== null &&
        source[key] !== ""
      ) {
        return source[key];
      }
    }
  }
  return null;
}

function coherentTotalLimit({
  configured,
  maximumCalls,
  maximumPerCall,
  technicalMaximum,
  strict,
  fallback,
  label,
}) {
  const configuredLimit = positiveInteger(
    configured,
    fallback,
    technicalMaximum,
    label,
  );
  if (strict) return configuredLimit;

  const derived = Math.min(
    technicalMaximum,
    maximumCalls * maximumPerCall,
  );
  return Math.max(configuredLimit, derived);
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

  const maximumCalls = positiveInteger(
    valueFromSources(sources, ["maximum_calls", "max_calls"]),
    DEFAULT_LIMITS.maximum_calls,
    TECHNICAL_LIMITS.maximum_calls,
    "maximum_calls",
  );
  const maximumSingleCallOutputTokens = positiveInteger(
    valueFromSources(sources, [
      "maximum_single_call_output_tokens",
      "max_output_tokens_per_call",
    ]),
    DEFAULT_LIMITS.maximum_single_call_output_tokens,
    TECHNICAL_LIMITS.maximum_single_call_output_tokens,
    "maximum_single_call_output_tokens",
  );
  const maximumPromptCharacters = positiveInteger(
    valueFromSources(sources, [
      "maximum_prompt_characters",
      "max_prompt_characters",
    ]),
    DEFAULT_LIMITS.maximum_prompt_characters,
    TECHNICAL_LIMITS.maximum_prompt_characters,
    "maximum_prompt_characters",
  );
  const strictTotalLimits = firstBoolean(valueFromSources(sources, [
    "enforce_explicit_total_limits",
    "strict_total_limits",
  ])) === true;

  const maximumRequestedOutputTokens = coherentTotalLimit({
    configured: valueFromSources(sources, [
      "maximum_requested_output_tokens",
      "max_output_tokens_total",
      "maximum_output_tokens",
    ]),
    maximumCalls,
    maximumPerCall: maximumSingleCallOutputTokens,
    technicalMaximum: TECHNICAL_LIMITS.maximum_requested_output_tokens,
    strict: strictTotalLimits,
    fallback: DEFAULT_LIMITS.maximum_requested_output_tokens,
    label: "maximum_requested_output_tokens",
  });

  const maximumTotalPromptCharacters = coherentTotalLimit({
    configured: valueFromSources(sources, [
      "maximum_total_prompt_characters",
      "max_total_prompt_characters",
    ]),
    maximumCalls,
    maximumPerCall: maximumPromptCharacters,
    technicalMaximum: TECHNICAL_LIMITS.maximum_total_prompt_characters,
    strict: strictTotalLimits,
    fallback: DEFAULT_LIMITS.maximum_total_prompt_characters,
    label: "maximum_total_prompt_characters",
  });

  const resolved = {
    contract: "CREATIVE_REASONING_BUDGET_V2",
    budget_id: firstText(
      valueFromSources(sources, ["id", "budget_id", "profile_id"]),
      project.budget_profile?.id,
      mission.budget_profile?.id,
    ),
    project_id: project.id || null,
    mission_id: mission.id || mission.creative_mission_id || null,
    maximum_calls: maximumCalls,
    maximum_requested_output_tokens: maximumRequestedOutputTokens,
    maximum_single_call_output_tokens: maximumSingleCallOutputTokens,
    maximum_prompt_characters: maximumPromptCharacters,
    maximum_total_prompt_characters: maximumTotalPromptCharacters,
    maximum_customer_price: maximumCustomerPrice,
    currency: currency ? currency.toUpperCase() : null,
    strict_total_limits: strictTotalLimits,
    call_count: 0,
    requested_output_tokens: 0,
    reserved_output_tokens: 0,
    settled_output_tokens: 0,
    released_output_tokens: 0,
    reported_output_tokens: 0,
    estimated_output_tokens: 0,
    prompt_characters: 0,
    customer_price_spent: 0,
    supplier_cost_spent: 0,
    operations: [],
    failure: null,
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
    strict_total_limits: resolved.strict_total_limits,
  })).digest("hex");

  return resolved;
}

function promptCharacters(input = {}) {
  const prompt =
    input.input?.prompt ??
    input.input?.input ??
    input.input?.messages ??
    "";
  return typeof prompt === "string"
    ? prompt.length
    : JSON.stringify(prompt || "").length;
}

function requestedOutputTokens(input = {}) {
  const number = finite(
    input.input?.max_output_tokens ??
    input.input?.maxOutputTokens ??
    1,
  );
  if (number === null || number <= 0) {
    throw new Error(
      "CREATIVE_REASONING_REQUESTED_OUTPUT_TOKENS_INVALID",
    );
  }
  return Math.floor(number);
}

function resultPrice(result = {}) {
  const pricing =
    result.pricing ||
    result.reservation_pricing ||
    result.cost_guard?.evidence ||
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
    pricing_id:
      pricing.pricing_id ||
      result.usage?.pricing_id ||
      null,
    provider: result.provider || pricing.provider || null,
    model: result.model || pricing.model || null,
  };
}

function outputTokenCandidates(result = {}) {
  return [
    result.billing?.usage?.metadata?.provider_usage,
    result.usage?.metadata?.provider_usage,
    result.output?.usage,
    result.output?.output?.usage,
    result.output?.raw?.usage,
    result.output?.output?.raw?.usage,
    result.raw?.usage,
  ].filter((value) => value && typeof value === "object");
}

function reportedOutputTokens(result = {}) {
  for (const usage of outputTokenCandidates(result)) {
    const number = firstFinite(
      usage.output_tokens,
      usage.outputTokens,
      usage.completion_tokens,
      usage.completionTokens,
    );
    if (number !== null && number >= 0) return Math.ceil(number);
  }
  return null;
}

function resultOutputValue(result = {}) {
  return (
    result.output?.output?.text ??
    result.output?.text ??
    result.output?.output?.content ??
    result.output?.content ??
    result.output?.output ??
    result.output ??
    result.result ??
    null
  );
}

function estimateOutputTokens(result = {}) {
  const value = resultOutputValue(result);
  if (value === null || value === undefined) return null;
  let source;
  try {
    source = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    source = text(value);
  }
  if (!source) return 0;
  return Math.max(1, Math.ceil(source.length / 3));
}

function settledTokenUsage(result = {}, reservation = 0) {
  const reported = reportedOutputTokens(result);
  if (reported !== null) {
    return {
      tokens: Math.min(reservation, reported),
      reported_tokens: reported,
      estimated_tokens: 0,
      source: "PROVIDER_USAGE",
    };
  }

  const estimated = estimateOutputTokens(result);
  if (estimated !== null) {
    return {
      tokens: Math.min(reservation, estimated),
      reported_tokens: 0,
      estimated_tokens: estimated,
      source: "CONSERVATIVE_OUTPUT_SIZE_ESTIMATE",
    };
  }

  return {
    tokens: reservation,
    reported_tokens: 0,
    estimated_tokens: reservation,
    source: "RESERVATION_FALLBACK",
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

function remainingOutputTokens(budget) {
  return Math.max(
    0,
    budget.maximum_requested_output_tokens -
      budget.settled_output_tokens -
      budget.reserved_output_tokens,
  );
}

function governedReasoningInput(input = {}, reservedTokens) {
  const payload = object(input.input);
  return {
    ...input,
    input: {
      ...payload,
      max_output_tokens: reservedTokens,
      maxOutputTokens: undefined,
    },
  };
}

function preflight(budget, input = {}) {
  const operation =
    text(input.metadata?.operation) ||
    "CREATIVE_REASONING";
  const requestedTokens = requestedOutputTokens(input);
  const characters = promptCharacters(input);

  if (
    requestedTokens >
    TECHNICAL_LIMITS.maximum_single_call_output_tokens
  ) {
    throw new Error(
      `CREATIVE_REASONING_TECHNICAL_SINGLE_CALL_LIMIT_EXCEEDED:` +
      `${operation}:${requestedTokens}:` +
      `${TECHNICAL_LIMITS.maximum_single_call_output_tokens}`,
    );
  }
  if (requestedTokens > budget.maximum_single_call_output_tokens) {
    throw new Error(
      `CREATIVE_REASONING_SINGLE_CALL_TOKEN_BUDGET_EXCEEDED:` +
      `${operation}:${requestedTokens}:` +
      `${budget.maximum_single_call_output_tokens}`,
    );
  }
  if (budget.call_count + 1 > budget.maximum_calls) {
    throw new Error(
      `CREATIVE_REASONING_CALL_BUDGET_EXCEEDED:` +
      `${operation}:${budget.call_count + 1}:` +
      `${budget.maximum_calls}`,
    );
  }

  const availableTokens = remainingOutputTokens(budget);
  if (availableTokens <= 0) {
    throw new Error(
      `CREATIVE_REASONING_OUTPUT_TOKEN_BUDGET_EXHAUSTED:` +
      `${operation}:${budget.settled_output_tokens}:` +
      `${budget.maximum_requested_output_tokens}`,
    );
  }
  const reservedTokens = Math.min(requestedTokens, availableTokens);

  if (characters > budget.maximum_prompt_characters) {
    throw new Error(
      `CREATIVE_REASONING_PROMPT_SIZE_EXCEEDED:` +
      `${operation}:${characters}:` +
      `${budget.maximum_prompt_characters}`,
    );
  }
  if (
    budget.prompt_characters + characters >
    budget.maximum_total_prompt_characters
  ) {
    throw new Error(
      `CREATIVE_REASONING_TOTAL_PROMPT_BUDGET_EXCEEDED:` +
      `${operation}:${budget.prompt_characters + characters}:` +
      `${budget.maximum_total_prompt_characters}`,
    );
  }

  const remaining = remainingCustomerPrice(budget);
  if (remaining !== null && remaining <= 0) {
    throw new Error(
      `CREATIVE_REASONING_CUSTOMER_PRICE_BUDGET_EXHAUSTED:${operation}`,
    );
  }

  budget.call_count += 1;
  budget.requested_output_tokens += requestedTokens;
  budget.reserved_output_tokens += reservedTokens;
  budget.prompt_characters += characters;

  return {
    operation,
    sequence: budget.call_count,
    requested_output_tokens: requestedTokens,
    reserved_output_tokens: reservedTokens,
    output_token_limit_reduced:
      reservedTokens < requestedTokens,
    prompt_characters: characters,
    remaining_output_tokens_before_call: availableTokens,
    remaining_customer_price_before_call: remaining,
  };
}

function releaseTokenReservation(budget, call, settlement = null) {
  const reserved = Number(call?.reserved_output_tokens || 0);
  budget.reserved_output_tokens = Math.max(
    0,
    budget.reserved_output_tokens - reserved,
  );
  if (!settlement) {
    budget.released_output_tokens += reserved;
    return;
  }

  budget.settled_output_tokens += settlement.tokens;
  budget.reported_output_tokens += settlement.reported_tokens;
  budget.estimated_output_tokens += settlement.estimated_tokens;
  budget.released_output_tokens += Math.max(
    0,
    reserved - settlement.tokens,
  );
}

function recordResult(budget, call, result = {}) {
  const price = resultPrice(result);
  if (
    budget.currency &&
    price.currency &&
    price.currency.toUpperCase() !== budget.currency
  ) {
    throw new Error(
      `CREATIVE_REASONING_BUDGET_CURRENCY_MISMATCH:` +
      `${price.currency}:${budget.currency}`,
    );
  }
  if (!budget.currency && price.currency) {
    budget.currency = price.currency.toUpperCase();
  }

  const tokenSettlement = settledTokenUsage(
    result,
    call.reserved_output_tokens,
  );
  releaseTokenReservation(budget, call, tokenSettlement);

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
      `CREATIVE_REASONING_CUSTOMER_PRICE_BUDGET_EXCEEDED:` +
      `${budget.customer_price_spent}:` +
      `${budget.maximum_customer_price}`,
    );
  }
  if (
    budget.settled_output_tokens >
    budget.maximum_requested_output_tokens
  ) {
    throw new Error(
      `CREATIVE_REASONING_SETTLED_TOKEN_BUDGET_EXCEEDED:` +
      `${budget.settled_output_tokens}:` +
      `${budget.maximum_requested_output_tokens}`,
    );
  }

  budget.operations.push({
    ...call,
    settled_output_tokens: tokenSettlement.tokens,
    reported_output_tokens: tokenSettlement.reported_tokens,
    estimated_output_tokens: tokenSettlement.estimated_tokens,
    released_output_tokens: Math.max(
      0,
      call.reserved_output_tokens - tokenSettlement.tokens,
    ),
    token_settlement_source: tokenSettlement.source,
    customer_price: price.customer_price,
    supplier_cost: price.supplier_cost,
    currency: price.currency || budget.currency,
    pricing_id: price.pricing_id,
    provider: price.provider,
    model: price.model,
    remaining_output_tokens_after_call:
      remainingOutputTokens(budget),
    remaining_customer_price_after_call:
      remainingCustomerPrice(budget),
    completed: true,
  });
}

function recordFailure(budget, input = {}, error, call = null) {
  if (call) releaseTokenReservation(budget, call);
  budget.operations.push({
    operation:
      call?.operation ||
      text(input.metadata?.operation) ||
      "CREATIVE_REASONING",
    sequence: call?.sequence || budget.call_count + 1,
    requested_output_tokens:
      call?.requested_output_tokens ||
      requestedOutputTokens(input),
    reserved_output_tokens:
      call?.reserved_output_tokens || 0,
    released_output_tokens:
      call?.reserved_output_tokens || 0,
    failed: true,
    error: error?.message || String(error),
    additional_calls_cancelled: true,
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
      maximum_prompt_characters:
        budget.maximum_prompt_characters,
      maximum_total_prompt_characters:
        budget.maximum_total_prompt_characters,
      maximum_customer_price:
        budget.maximum_customer_price,
      currency: budget.currency,
      strict_total_limits: budget.strict_total_limits,
    },
    usage: {
      call_count: budget.call_count,
      requested_output_tokens:
        budget.requested_output_tokens,
      reserved_output_tokens:
        budget.reserved_output_tokens,
      settled_output_tokens:
        budget.settled_output_tokens,
      reported_output_tokens:
        budget.reported_output_tokens,
      estimated_output_tokens:
        budget.estimated_output_tokens,
      released_output_tokens:
        budget.released_output_tokens,
      remaining_output_tokens:
        remainingOutputTokens(budget),
      prompt_characters: budget.prompt_characters,
      customer_price_spent:
        budget.customer_price_spent,
      supplier_cost_spent:
        budget.supplier_cost_spent,
      remaining_customer_price:
        remainingCustomerPrice(budget),
    },
    operations: budget.operations,
    serialized_execution: true,
    parallel_wallet_reservations_prohibited: true,
    output_token_reservation_settlement: true,
    coherent_total_limits_derived_from_call_capacity:
      !budget.strict_total_limits,
    failed_operation: budget.failure?.message || null,
    passed: !budget.failure,
  };
}

function installExecutionBudget() {
  if (ServiceExecutionRuntime[EXECUTION_FLAG]) return;
  const executeWithoutBudget =
    ServiceExecutionRuntime.execute.bind(
      ServiceExecutionRuntime,
    );

  Object.defineProperty(ServiceExecutionRuntime, EXECUTION_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute =
    async function executeWithReasoningBudget(input = {}) {
      const budget = storage.getStore();
      const governed =
        budget &&
        input.service_id === "ai.reasoning.execute" &&
        input.category === "CREATIVE_DIRECTION";
      if (!governed) return executeWithoutBudget(input);

      const executeOne = async () => {
        if (budget.failure) throw budget.failure;
        let call = null;
        try {
          call = preflight(budget, input);
          const remaining =
            call.remaining_customer_price_before_call;
          const result = await executeWithoutBudget({
            ...governedReasoningInput(
              input,
              call.reserved_output_tokens,
            ),
            cost_guard:
              remaining !== null || budget.currency
                ? {
                    contract:
                      "SERVICE_EXECUTION_COST_GUARD_V1",
                    maximum_customer_price: remaining,
                    currency: budget.currency,
                    reference:
                      `${budget.budget_hash}:` +
                      `${call.sequence}:` +
                      `${call.operation}`,
                  }
                : null,
            metadata: {
              ...object(input.metadata),
              creative_reasoning_budget_contract:
                budget.contract,
              creative_reasoning_budget_hash:
                budget.budget_hash,
              creative_reasoning_budget_sequence:
                call.sequence,
              creative_reasoning_budget_operation:
                call.operation,
              creative_reasoning_requested_output_tokens:
                call.requested_output_tokens,
              creative_reasoning_reserved_output_tokens:
                call.reserved_output_tokens,
            },
          });
          recordResult(budget, call, result);
          return result;
        } catch (error) {
          if (!budget.failure) {
            budget.failure = error;
            recordFailure(budget, input, error, call);
          }
          throw error;
        }
      };

      const queued = budget.queue.then(executeOne);
      budget.queue = queued.then(
        () => null,
        () => null,
      );
      return queued;
    };
}

function installDirectionBudget() {
  if (CreativeUniversalTemporalDirectionRuntime[DIRECTION_FLAG]) {
    return;
  }
  const createWithoutBudget =
    CreativeUniversalTemporalDirectionRuntime.create.bind(
      CreativeUniversalTemporalDirectionRuntime,
    );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    DIRECTION_FLAG,
    {
      value: true,
      enumerable: false,
      configurable: false,
    },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithReasoningBudget(input = {}) {
      if (storage.getStore()) return createWithoutBudget(input);
      const budget = resolveBudget(input);
      return storage.run(budget, async () => {
        const directed = await createWithoutBudget(input);
        await budget.queue;
        if (budget.failure) throw budget.failure;
        const evidence = summary(budget);
        return {
          ...directed,
          reasoning_budget: evidence,
          plan: {
            ...object(directed.plan),
            production: {
              ...object(directed.plan?.production),
              reasoning_budget_contract:
                evidence.contract,
              reasoning_budget_hash:
                evidence.budget_hash,
              reasoning_budget_passed: true,
              reasoning_calls_used:
                evidence.usage.call_count,
              reasoning_output_tokens_settled:
                evidence.usage.settled_output_tokens,
              reasoning_output_tokens_released:
                evidence.usage.released_output_tokens,
              reasoning_customer_price_spent:
                evidence.usage.customer_price_spent,
              reasoning_currency:
                evidence.limits.currency,
            },
            validation_summary: {
              ...object(directed.plan?.validation_summary),
              reasoning_budget_passed: true,
              reasoning_budget_hash:
                evidence.budget_hash,
              reasoning_calls_used:
                evidence.usage.call_count,
              reasoning_output_tokens_settled:
                evidence.usage.settled_output_tokens,
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
