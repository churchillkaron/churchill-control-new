import "@/lib/platform/service-runtime/execution/ServiceExecutionCostGuardRuntime";
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
  getProviderPricingById,
} from "@/lib/platform/service-runtime/pricing/repositories/ProviderPricingRepository";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_SAFETY_TOKENS,
  AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS,
  AVANTIQO_INTELLIGENCE_LOCAL_FAST_OUTPUT_CAP,
  AVANTIQO_INTELLIGENCE_LOCAL_MODEL,
} from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalPolicy.js";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.direction.cost-approval.v3",
);

const APPROVAL_CONTRACT = "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2";
const TRIBUNAL_APPROVAL_CONTRACT = "CREATIVE_TRIBUNAL_BUDGET_APPROVAL_V1";
const BENCHMARK_SCOPE = "BENCHMARK_REVIEW_PREVIEW";
const DIRECTION_QUEUE_BY_PROJECT = new Map();

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

function approvalList(approval = {}, field, fallback = []) {
  const values = list(approval[field]).map(text).filter(Boolean);
  return values.length ? values : fallback.map(text).filter(Boolean);
}

const DIRECTION_IN_PROGRESS_CONTINUATION_WINDOW_MS = 6 * 60 * 60 * 1000;

function approvalTimeWindowValid({ approval = {}, status = "", approvedAt, expiresAt, now }) {
  if (approvedAt === null || expiresAt === null || approvedAt > now) return false;
  if (expiresAt > now) return true;
  // expires_at is a start-by deadline. Once a governed pipeline has consumed a call,
  // it may finish inside a bounded continuation window without increasing either
  // the monetary ceiling or call ceiling. This prevents slow async providers from
  // invalidating an approval halfway through the work it already authorized.
  return status === "IN_PROGRESS" &&
    Number(approval.call_count || 0) > 0 &&
    now <= expiresAt + DIRECTION_IN_PROGRESS_CONTINUATION_WINDOW_MS;
}

function approvalChannel(operation = "") {
  const tribunal = text(operation).toUpperCase().startsWith("CREATIVE_DYNAMIC_TRIBUNAL_");
  return tribunal
    ? {
        key: "paid_tribunal_approval",
        contract: TRIBUNAL_APPROVAL_CONTRACT,
        errorPrefix: "CREATIVE_TRIBUNAL",
        metadataPrefix: "tribunal",
      }
    : {
        key: "paid_direction_approval",
        contract: APPROVAL_CONTRACT,
        errorPrefix: "CREATIVE_DIRECTION",
        metadataPrefix: "direction",
      };
}

function approvalState(project = {}, operation = "") {
  const channel = approvalChannel(operation);
  const approval = object(project.metadata?.[channel.key]);
  const approvedAt = validDate(approval.approved_at);
  const expiresAt = validDate(approval.expires_at);
  const now = Date.now();
  const status = text(approval.status).toUpperCase();
  const maximum = finite(approval.maximum_customer_price);
  const spent = Math.max(0, finite(approval.spent_customer_price) || 0);
  const remaining = maximum === null
    ? null
    : Number(Math.max(0, maximum - spent).toFixed(6));

  if (approval.contract !== channel.contract) {
    throw new Error(`${channel.errorPrefix}_BUDGET_APPROVAL_REQUIRED`);
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
    throw new Error(`${channel.errorPrefix}_BUDGET_APPROVAL_INVALID`);
  }
  if (
    approval.approved !== true ||
    !["APPROVED", "IN_PROGRESS"].includes(status) ||
    !approvalTimeWindowValid({ approval, status, approvedAt, expiresAt, now })
  ) {
    throw new Error(`${channel.errorPrefix}_BUDGET_APPROVAL_REQUIRED:${operation}`);
  }
  if (
    text(approval.command_identity) !== text(project.metadata?.command_identity)
  ) {
    throw new Error(`${channel.errorPrefix}_BUDGET_COMMAND_MISMATCH`);
  }
  if (!operationAllowed(operation, approval.allowed_operations)) {
    throw new Error(`${channel.errorPrefix}_OPERATION_NOT_APPROVED:${operation}`);
  }
  if (remaining === null || remaining <= 0) {
    throw new Error(`${channel.errorPrefix}_BUDGET_EXHAUSTED`);
  }
  if (Number(approval.call_count || 0) >= Number(approval.maximum_calls)) {
    throw new Error(`${channel.errorPrefix}_CALL_BUDGET_EXHAUSTED`);
  }

  return { approval, maximum, spent, remaining, channel };
}

async function updateApproval(project, approval, patch, channel = approvalChannel()) {
  const current = await CreativeProjectRuntime.get(project.id);
  const currentApproval = object(
    current?.metadata?.[channel.key] || approval,
  );
  return CreativeProjectRuntime.update(project.id, {
    metadata: {
      ...(current?.metadata || project.metadata || {}),
      [channel.key]: {
        ...currentApproval,
        ...patch,
      },
    },
  });
}

function benchmarkApproval(approval = {}) {
  return Boolean(
    approval.benchmark_review_preview === true &&
    text(approval.execution_scope).toUpperCase() === BENCHMARK_SCOPE &&
    approval.owned_only_required === true &&
    approval.external_ai_provider_allowed === false
  );
}

function localOwnedDirectionApproval(approval = {}) {
  return Boolean(
    benchmarkApproval(approval) &&
    text(approval.provider) === "avantiqo-intelligence" &&
    text(approval.model) === AVANTIQO_INTELLIGENCE_LOCAL_MODEL &&
    approval.external_fallback_allowed === false
  );
}

function ownedZeroPriceDirectionApproval(approval = {}) {
  return Boolean(
    localOwnedDirectionApproval(approval) &&
    text(approval.local_zero_price_rebase_contract) ===
      "CREATIVE_DIRECTION_LOCAL_ZERO_PRICE_REBASE_V1" &&
    Number(approval.spent_customer_price || 0) === 0 &&
    approval.media_generation_authorized !== true &&
    approval.publication_authorized !== true &&
    approval.external_fallback_allowed === false
  );
}

function localDirectionBudgetInput(input = {}, operation = "", approval = {}) {
  if (!localOwnedDirectionApproval(approval)) return input;
  const governedPrompt = governedConceptPrompt(input?.input?.prompt, operation);
  const instructions = text(input?.input?.instructions_text || input?.input?.system_prompt || input?.input?.systemPrompt);
  const promptTokens = Math.max(1, Math.ceil([instructions, governedPrompt].filter(Boolean).join("\n").length / 3.2));
  const availableOutput = Math.max(
    1,
    AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS -
      AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_SAFETY_TOKENS -
      promptTokens,
  );
  const requestedOutput = Math.max(
    1,
    Math.ceil(finite(input?.input?.max_output_tokens ?? input?.input?.maxOutputTokens) || 8192),
  );
  const localOutput = Math.min(
    requestedOutput,
    AVANTIQO_INTELLIGENCE_LOCAL_FAST_OUTPUT_CAP,
    availableOutput,
  );
  if (localOutput < DIRECTION_MINIMUM_BOUNDED_OUTPUT_TOKENS) {
    throw new Error(
      `CREATIVE_DIRECTION_LOCAL_CONTEXT_TOO_SMALL:${promptTokens}:${localOutput}:${operation}`,
    );
  }
  return {
    ...input,
    input: {
      ...(input.input || {}),
      prompt: governedPrompt,
      max_output_tokens: localOutput,
      execution_lane: "deep",
      local_compute_required: true,
      infrastructure_policy: "local_only",
    },
  };
}

const DIRECTION_INPUT_TOKEN_RESERVATION_HEADROOM = 1.15;

function estimatedDirectionUsage(input = {}) {
  const prompt = text(input?.input?.prompt);
  const outputTokens = Math.max(1, Math.ceil(finite(input?.input?.max_output_tokens ?? input?.input?.maxOutputTokens) || 8192));
  // Reserve above the character/token heuristic because the owned provider's tokenizer can
  // report slightly more input tokens than prompt.length / 2.5. Settlement still charges
  // provider-reported actual usage and remains bounded by the approved per-call/total budget.
  const heuristicInputTokens = Math.max(1, Math.ceil(prompt.length / 2.5));
  const inputTokens = Math.max(
    heuristicInputTokens,
    Math.ceil(heuristicInputTokens * DIRECTION_INPUT_TOKEN_RESERVATION_HEADROOM),
  );
  return { quantity: 1, input_tokens: inputTokens, output_tokens: outputTokens, estimated: true };
}

const DIRECTION_BUDGET_TOKEN_SAFETY_RATIO = 0.88;
const DIRECTION_MINIMUM_BOUNDED_OUTPUT_TOKENS = 1024;

async function boundedDirectionUsage({ approval, input, maximumForCall, operation = "" }) {
  const requested = estimatedDirectionUsage(input);
  const requestedPricing = await currentPricing(approval, requested);
  const safeMaximum = Number((maximumForCall * DIRECTION_BUDGET_TOKEN_SAFETY_RATIO).toFixed(6));
  if (Number(requestedPricing.customer_price) <= safeMaximum) {
    return { usage: requested, pricing: requestedPricing, capped: false };
  }

  let low = 1;
  let high = requested.output_tokens;
  let best = 0;
  let bestPricing = null;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const usage = { ...requested, output_tokens: mid };
    const pricing = await currentPricing(approval, usage);
    if (Number(pricing.customer_price) <= safeMaximum) {
      best = mid;
      bestPricing = pricing;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const minimumBoundedOutputTokens = operation.startsWith("CREATIVE_DYNAMIC_TRIBUNAL_") && operation.includes("REVIEWER") ? 160 : DIRECTION_MINIMUM_BOUNDED_OUTPUT_TOKENS;
  if (best < minimumBoundedOutputTokens || !bestPricing) {
    throw new Error(
      `CREATIVE_DIRECTION_BUDGET_TAIL_TOO_SMALL:${maximumForCall}:${best}:${operation}:${requested.input_tokens}:${requested.output_tokens}`,
    );
  }
  return {
    usage: { ...requested, output_tokens: best },
    pricing: bestPricing,
    capped: true,
  };
}

async function currentPricing(approval, usage = { quantity: 1 }) {
  let pricing;
  if (benchmarkApproval(approval)) {
    const record = await getProviderPricingById(approval.pricing_id);
    if (!record) throw new Error(`Pricing not found: ${approval.pricing_id}`);
    pricing = PricingRuntime.resolveRecord({
      pricing: {
        ...record,
        benchmark_review_preview_authorized: true,
      },
      provider: approval.provider,
      capability: approval.capability,
      model: approval.model,
      currency: approval.currency,
      usage,
    });
  } else {
    pricing = await PricingRuntime.resolveById({
      pricing_id: approval.pricing_id,
      currency: approval.currency,
      usage,
    });
  }

  if (
    text(pricing.provider) !== text(approval.provider) ||
    text(pricing.model) !== text(approval.model) ||
    text(pricing.currency).toUpperCase() !== text(approval.currency).toUpperCase()
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

function isConceptDirectorOperation(operation) {
  return text(operation).toUpperCase().startsWith("CREATIVE_CONCEPT_DIRECTOR_");
}

function conceptDirectorLabel(operation) {
  const current = text(operation).toUpperCase();
  if (current.includes("CONCEPT-A")) return "Narrative World";
  if (current.includes("CONCEPT-B")) return "Performance Energy";
  if (current.includes("CONCEPT-C")) return "Cultural Brand";
  return "Creative Direction";
}

function governedConceptPrompt(prompt, operation) {
  if (!isConceptDirectorOperation(operation)) return prompt;
  return `${text(prompt)}

EXECUTION FEASIBILITY CONTRACT
- The concept must be executable from the supplied EVIDENCE and approved assets. Do not invent a named, recognizable or identity-specific human when identity_profiles / subject_profiles do not provide an approved identity for that person.
- If the approved source asset contains no person identity, do not invent band members, performers, patrons, staff, crowds or other identifiable humans as required visual subjects. Build the concept around the approved environment, objects, lighting, camera movement, sound design and other source-grounded elements instead.
- Research may describe real people, activity or places, but research facts are not visual identity authorization. Never convert a research mention into an on-screen person without approved identity evidence.
- Respect the declared temporal contract. For a single continuous five-second shot, all story beats must be achievable inside that one shot. Do not propose montage, cut-ins, multiple shots, impossible geography changes or action density that cannot physically fit the approved duration.
- Keep the title concise and complete. A short title is acceptable; substantive completeness belongs in the proposition, world, causal story, environment, performance, music and brand fields.
`;
}

function normalizedConceptTitle(title, operation) {
  const current = text(title);
  if (!current || current.length >= 20) return current;
  return `${current} — ${conceptDirectorLabel(operation)}`;
}

function serviceResultFromSettledDirectionUsage(usage = {}) {
  const providerResult = object(usage.metadata?.provider_result || usage.metadata?.result);
  return {
    success: true,
    pending: false,
    provider: usage.provider || providerResult.provider || null,
    model: usage.provider_model || usage.metadata?.model || providerResult.model || null,
    pricing: usage.metadata?.settled_pricing || null,
    reservation_pricing: usage.metadata?.reservation_pricing || null,
    usage,
    billing: {
      id: usage.billing_invoice_line_id || usage.invoice_id || null,
      usage,
    },
    settlement: "CHARGED",
    output: providerResult,
    recovered_settled_direction_usage: true,
  };
}

async function recoverSettledNextDirectionUsage({ project, approval, operation, request_hash = null }) {
  const expectedSequence = Number(approval.call_count || 0) + 1;
  const expectedReference = `${approval.id}:${expectedSequence}:${operation}`;
  const expectedRequestHash = text(request_hash);
  const rows = await UsageRuntime.organization(project.organization_id);
  const candidates = list(rows)
    .filter((usage) =>
      text(usage.status).toUpperCase() === "SUCCESS" &&
      text(usage.category).toUpperCase() === "CREATIVE_DIRECTION" &&
      text(usage.metadata?.creative_project_id) === text(project.id) &&
      text(usage.metadata?.operation).toUpperCase() === operation &&
      text(usage.metadata?.direction_approval_id) === text(approval.id) &&
      text(usage.metadata?.service_cost_guard_reference) === expectedReference &&
      (!expectedRequestHash ||
        text(usage.metadata?.creative_direction_request_hash) === expectedRequestHash)
    )
    .sort((left, right) => Date.parse(right.updated_at || right.created_at || 0) - Date.parse(left.updated_at || left.created_at || 0));
  return candidates[0] || null;
}

function normalizeConceptDirectorResult(result = {}, operation = "") {
  if (!isConceptDirectorOperation(operation)) return result;

  const outerOutput = object(result.output);
  const nestedOutput = object(outerOutput.output);
  if (Object.keys(nestedOutput).length && Object.keys(object(nestedOutput.concept)).length) {
    const concept = object(nestedOutput.concept);
    return {
      ...result,
      output: {
        ...outerOutput,
        output: {
          ...nestedOutput,
          concept: {
            ...concept,
            title: normalizedConceptTitle(concept.title, operation),
          },
        },
      },
    };
  }

  if (Object.keys(object(outerOutput.concept)).length) {
    const concept = object(outerOutput.concept);
    return {
      ...result,
      output: {
        ...outerOutput,
        concept: {
          ...concept,
          title: normalizedConceptTitle(concept.title, operation),
        },
      },
    };
  }

  return result;
}

const DIRECTION_PENDING_POLL_INTERVAL_MS = 2_000;
const DIRECTION_PENDING_MAXIMUM_POLLS = 300;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function settleDirectionProviderResult(result = {}, governedInput = {}) {
  if (result?.pending !== true) return result;
  const provider = text(result.provider);
  const providerJobId = text(result.provider_job_id);
  const usageId = text(result.usage?.id);
  if (!provider || !providerJobId || !usageId) {
    throw new Error("CREATIVE_DIRECTION_PENDING_SETTLEMENT_IDENTITY_REQUIRED");
  }

  let current = result;
  for (let poll = 1; poll <= DIRECTION_PENDING_MAXIMUM_POLLS; poll += 1) {
    if (poll > 1) await sleep(DIRECTION_PENDING_POLL_INTERVAL_MS);
    current = await ServiceExecutionRuntime.settle({
      organization_id: governedInput.organization_id,
      provider,
      provider_job_id: providerJobId,
      usage_id: usageId,
      pricing: result.pricing || result.reservation_pricing || {},
      quantity: governedInput.input?.quantity ?? 1,
      unit: result.pricing?.unit || null,
      metadata: governedInput.metadata || {},
      provider_status_input: {},
      credential_id: result.credential_id || null,
      started_at: result.started_at || null,
    });
    if (current?.failed === true) {
      throw new Error(
        `CREATIVE_DIRECTION_PROVIDER_EXECUTION_FAILED:${text(current.error) || text(current.provider_status) || "UNKNOWN"}`,
      );
    }
    if (current?.pending !== true) {
      return {
        ...current,
        provider: current.provider || result.provider || null,
        model: current.model || current.pricing?.model || result.model || null,
      };
    }
  }

  throw new Error(
    `CREATIVE_DIRECTION_PROVIDER_COMPLETION_TIMEOUT:${provider}:${providerJobId}`,
  );
}

function enqueueDirection(projectId, execute) {
  const key = text(projectId);
  const prior = DIRECTION_QUEUE_BY_PROJECT.get(key) || Promise.resolve();
  const current = prior.catch(() => null).then(execute);
  // The queue tail exists only to serialize later work. It must not retain a
  // rejection after the caller has already received that rejection, otherwise
  // Node reports a second unhandled rejection and can terminate recovery before
  // the durable resume checkpoint is persisted.
  const tail = current.catch(() => null).finally(() => {
    if (DIRECTION_QUEUE_BY_PROJECT.get(key) === tail) {
      DIRECTION_QUEUE_BY_PROJECT.delete(key);
    }
  });
  DIRECTION_QUEUE_BY_PROJECT.set(key, tail);
  return current;
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

  async function executeGovernedDirection(input = {}) {
    const projectId = text(input.metadata?.creative_project_id);
    const operation = text(input.metadata?.operation).toUpperCase();
    if (!projectId) throw new Error("creative_project_id required");
    if (!operation) throw new Error("CREATIVE_DIRECTION_OPERATION_REQUIRED");

    const project = await CreativeProjectRuntime.get(projectId);
    if (!project || text(project.organization_id) !== text(input.organization_id)) {
      throw new Error("Creative project not found");
    }

    // Reconcile a provider result that was already authorized and charged before
    // evaluating whether a NEW paid call may start. This is intentionally scoped
    // to the exact next sequence, approval id and service cost-guard reference.
    // It cannot expand authority or spend again; it only repairs the approval ledger
    // after asynchronous settlement completed outside the original polling window.
    const recoveryChannel = approvalChannel(operation);
    const recoveryApproval = object(project.metadata?.[recoveryChannel.key]);
    const recoveredUsage = recoveryApproval.contract === recoveryChannel.contract
      ? await recoverSettledNextDirectionUsage({
          project,
          approval: recoveryApproval,
          operation,
          request_hash: input.metadata?.creative_direction_request_hash || null,
        })
      : null;
    if (recoveredUsage) {
      const charged = finite(recoveredUsage.customer_price);
      const pricingId = text(recoveredUsage.pricing_id);
      const maximum = finite(recoveryApproval.maximum_customer_price);
      const spentBefore = Math.max(0, finite(recoveryApproval.spent_customer_price) || 0);
      const remainingBefore = maximum === null
        ? null
        : Number(Math.max(0, maximum - spentBefore).toFixed(6));
      if (
        charged === null || charged < 0 ||
        maximum === null || remainingBefore === null ||
        charged > Number(recoveryApproval.maximum_per_call_customer_price) ||
        charged > remainingBefore ||
        text(recoveredUsage.provider) !== text(recoveryApproval.provider) ||
        !approvalList(recoveryApproval, "allowed_models", [recoveryApproval.model]).includes(text(recoveredUsage.provider_model || recoveredUsage.metadata?.model)) ||
        !approvalList(recoveryApproval, "allowed_pricing_ids", [recoveryApproval.pricing_id]).includes(pricingId) ||
        text(recoveredUsage.metadata?.direction_approval_id) !== text(recoveryApproval.id)
      ) {
        throw new Error(`${recoveryChannel.errorPrefix}_RECOVERED_SETTLEMENT_MISMATCH`);
      }

      const callCount = Number(recoveryApproval.call_count || 0) + 1;
      const spent = Number((spentBefore + charged).toFixed(6));
      const remaining = Number(Math.max(0, maximum - spent).toFixed(6));
      const completed = remaining <= 0 || callCount >= Number(recoveryApproval.maximum_calls);
      const operations = [
        ...list(recoveryApproval.operations),
        {
          sequence: callCount,
          operation,
          request_hash: input.metadata?.creative_direction_request_hash || null,
          usage_id: recoveredUsage.id,
          customer_price: charged,
          currency: recoveryApproval.currency,
          provider: recoveredUsage.provider || null,
          model: recoveredUsage.provider_model || recoveredUsage.metadata?.model || null,
          pricing_id: pricingId || null,
          completed_at: recoveredUsage.updated_at || new Date().toISOString(),
          recovered_after_async_settlement: true,
        },
      ];
      await updateApproval(project, recoveryApproval, {
        approved: !completed,
        status: completed ? "COMPLETED" : "IN_PROGRESS",
        call_count: callCount,
        spent_customer_price: spent,
        remaining_customer_price: remaining,
        operations,
        last_completed_operation: operation,
        last_usage_id: recoveredUsage.id,
        completed_at: completed ? new Date().toISOString() : null,
        retry_required: false,
        execution_error: null,
        recovered_settled_usage_at: new Date().toISOString(),
      }, recoveryChannel);
      return normalizeConceptDirectorResult(
        serviceResultFromSettledDirectionUsage(recoveredUsage),
        operation,
      );
    }

    const state = approvalState(project, operation);
    const approval = state.approval;
    const channel = state.channel;
    const incomingGuard = object(input.cost_guard || input.costGuard);
    const incomingMaximum = finite(incomingGuard.maximum_customer_price);
    const approvedPerCallMaximum = Number(approval.maximum_per_call_customer_price);
    const maximumForCall = Math.min(
      state.remaining,
      approvedPerCallMaximum,
      incomingMaximum === null ? Number.POSITIVE_INFINITY : incomingMaximum,
    );
    const executionInput = localDirectionBudgetInput(input, operation, approval);
    const bounded = await boundedDirectionUsage({
      approval,
      input: executionInput,
      maximumForCall,
      operation,
    });
    if (isConceptDirectorOperation(operation) && bounded.usage.output_tokens < 6000) {
      throw new Error(
        `CREATIVE_DIRECTION_CONCEPT_STORY_BUDGET_TAIL_TOO_SMALL:${maximumForCall}:${bounded.usage.output_tokens}:6000`,
      );
    }
    const estimatedUsage = bounded.usage;
    const pricing = bounded.pricing;
    await updateApproval(project, approval, {
      status: "IN_PROGRESS",
      last_operation_started: operation,
      last_attempt_started_at: new Date().toISOString(),
      retry_required: false,
    }, channel);

    const benchmark = benchmarkApproval(approval);

    const governedInput = {
      ...executionInput,
      service_id: approval.capability,
      provider_id: approval.provider,
      input: {
        ...(executionInput.input || {}),
        prompt: localOwnedDirectionApproval(approval)
          ? executionInput.input?.prompt
          : governedConceptPrompt(executionInput.input?.prompt, operation),
        max_output_tokens: estimatedUsage.output_tokens,
        execution_lane: benchmark === true
          ? "deep"
          : (input.input?.execution_lane || input.input?.executionLane || "deep"),
        local_compute_required: benchmark === true,
        infrastructure_policy: benchmark === true ? "local_only" : input.input?.infrastructure_policy,
        currency: approval.currency,
      },
      cost_guard: {
        ...incomingGuard,
        contract: "SERVICE_EXECUTION_COST_GUARD_V1",
        maximum_customer_price: maximumForCall,
        currency: approval.currency,
        estimated_input_tokens: estimatedUsage.input_tokens,
        estimated_output_tokens: estimatedUsage.output_tokens,
        estimated_quantity: 1,
        reference:
          incomingGuard.reference ||
          `${approval.id}:${Number(approval.call_count || 0) + 1}:${operation}`,
      },
      provider_policy: {
        ...(input.provider_policy || {}),
        allowed_providers: [approval.provider],
        preferred_providers: [approval.provider],
        allowed_models: [approval.model],
        preferred_models: [approval.model],
        ...(benchmark
          ? {
              execution_scope: BENCHMARK_SCOPE,
              benchmark_only: true,
              owned_only_required: true,
              external_fallback_allowed: false,
              studio_preproduction_review: true,
            }
          : {}),
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
        [`${channel.metadataPrefix}_approval_contract`]: channel.contract,
        [`${channel.metadataPrefix}_approval_id`]: approval.id,
        [`${channel.metadataPrefix}_approved_at`]: approval.approved_at,
        [`${channel.metadataPrefix}_budget_maximum_customer_price`]: approval.maximum_customer_price,
        [`${channel.metadataPrefix}_budget_remaining_before_call`]: state.remaining,
        [`${channel.metadataPrefix}_budget_token_cap_applied`]: bounded.capped,
        [`${channel.metadataPrefix}_budget_estimated_input_tokens`]: estimatedUsage.input_tokens,
        [`${channel.metadataPrefix}_budget_max_output_tokens`]: estimatedUsage.output_tokens,
        [`${channel.metadataPrefix}_approval_currency`]: approval.currency,
        [`${channel.metadataPrefix}_approval_capability`]: approval.capability,
        [`${channel.metadataPrefix}_approval_model`]: approval.model,
        [`${channel.metadataPrefix}_execution_serialized`]: true,
        ...(benchmark
          ? {
              execution_scope: BENCHMARK_SCOPE,
              benchmark_only: true,
              production_certified: false,
            }
          : {}),
        concept_execution_feasibility_contract:
          isConceptDirectorOperation(operation)
            ? "CREATIVE_CONCEPT_EXECUTION_FEASIBILITY_V1"
            : undefined,
      },
    };

    let result;
    try {
      result = await executeWithoutDirectionGate(governedInput);
      result = await settleDirectionProviderResult(result, governedInput);
    } catch (error) {
      await updateApproval(project, approval, {
        approved: true,
        status: "APPROVED",
        retry_required: true,
        last_failed_operation: operation,
        execution_error: text(error?.message || error),
        failed_at: new Date().toISOString(),
      }, channel).catch(() => null);
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
      !approvalList(approval, "allowed_models", [approval.model]).includes(text(result?.model)) ||
      !approvalList(approval, "allowed_pricing_ids", [approval.pricing_id]).includes(pricingId)
    ) {
      await updateApproval(project, approval, {
        approved: false,
        status: "SETTLEMENT_MISMATCH",
        retry_required: true,
        last_failed_operation: operation,
        settled_customer_price: charged,
        settled_pricing_id: pricingId || null,
        failed_at: new Date().toISOString(),
      }, channel).catch(() => null);
      throw new Error(`${channel.errorPrefix}_BUDGET_SETTLEMENT_MISMATCH`);
    }

    const spent = Number((state.spent + charged).toFixed(6));
    const callCount = Number(approval.call_count || 0) + 1;
    const remaining = Number(Math.max(0, state.maximum - spent).toFixed(6));
    const completed = remaining <= 0 || callCount >= Number(approval.maximum_calls);
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
    }, channel);

    return normalizeConceptDirectorResult(result, operation);
  }

  ServiceExecutionRuntime.execute = async function executeWithDirectionGate(input = {}) {
    if (text(input.category).toUpperCase() !== "CREATIVE_DIRECTION") {
      return executeWithoutDirectionGate(input);
    }

    const projectId = text(input.metadata?.creative_project_id);
    if (!projectId) throw new Error("creative_project_id required");

    return enqueueDirection(projectId, () => executeGovernedDirection(input));
  };
}

export async function renewCreativeDirectionApprovalWindow({
  project_id,
  approval_id,
  authorization_source,
} = {}) {
  const projectId = text(project_id);
  const approvalId = text(approval_id);
  if (!projectId || !approvalId) throw new Error("CREATIVE_DIRECTION_CONTINUATION_IDENTITY_REQUIRED");
  const project = await CreativeProjectRuntime.get(projectId);
  if (!project) throw new Error("Creative project not found");
  const approval = object(project.metadata?.paid_direction_approval);
  if (approval.contract !== APPROVAL_CONTRACT || text(approval.id) !== approvalId) {
    throw new Error("CREATIVE_DIRECTION_CONTINUATION_APPROVAL_MISMATCH");
  }
  if (approval.approved !== true || text(approval.status).toUpperCase() !== "IN_PROGRESS") {
    throw new Error("CREATIVE_DIRECTION_CONTINUATION_ACTIVE_APPROVAL_REQUIRED");
  }
  if (
    !ownedZeroPriceDirectionApproval(approval) &&
    Number(approval.call_count || 0) >= Number(approval.maximum_calls || 0)
  ) {
    throw new Error("CREATIVE_DIRECTION_CONTINUATION_CALL_BUDGET_EXHAUSTED");
  }
  if (Number(approval.remaining_customer_price || 0) <= 0) {
    throw new Error("CREATIVE_DIRECTION_CONTINUATION_PRICE_BUDGET_EXHAUSTED");
  }
  if (approval.media_generation_authorized === true || approval.publication_authorized === true || approval.external_fallback_allowed === true) {
    throw new Error("CREATIVE_DIRECTION_CONTINUATION_AUTHORITY_EXPANSION_FORBIDDEN");
  }
  const now = new Date();
  const renewed = {
    ...approval,
    expires_at: new Date(now.getTime() + DIRECTION_IN_PROGRESS_CONTINUATION_WINDOW_MS).toISOString(),
    continuation_authorized_at: now.toISOString(),
    continuation_authorization_source: text(authorization_source) || "EXISTING_APPROVAL_SCOPE_CONTINUATION",
    retry_required: false,
    execution_error: null,
  };
  await updateApproval(project, approval, renewed, approvalChannel("CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1"));
  return renewed;
}

export async function continueCreativeTribunalApproval({
  project_id,
  approval_id,
  maximum_calls,
  maximum_customer_price,
  authorization_source,
} = {}) {
  const projectId = text(project_id);
  const approvalId = text(approval_id);
  const requestedMaximumCalls = finite(maximum_calls);
  const requestedMaximumPrice = finite(maximum_customer_price);
  if (!projectId || !approvalId) throw new Error("CREATIVE_TRIBUNAL_CONTINUATION_IDENTITY_REQUIRED");
  if (!Number.isInteger(requestedMaximumCalls) || requestedMaximumCalls <= 0) {
    throw new Error("CREATIVE_TRIBUNAL_CONTINUATION_CALL_CEILING_INVALID");
  }
  if (requestedMaximumPrice === null || requestedMaximumPrice <= 0) {
    throw new Error("CREATIVE_TRIBUNAL_CONTINUATION_PRICE_CEILING_INVALID");
  }

  const project = await CreativeProjectRuntime.get(projectId);
  if (!project) throw new Error("Creative project not found");
  const approval = object(project.metadata?.paid_tribunal_approval);
  if (approval.contract !== TRIBUNAL_APPROVAL_CONTRACT || text(approval.id) !== approvalId) {
    throw new Error("CREATIVE_TRIBUNAL_CONTINUATION_APPROVAL_MISMATCH");
  }
  if (Number(approval.maximum_customer_price) !== requestedMaximumPrice) {
    throw new Error("CREATIVE_TRIBUNAL_CONTINUATION_CANNOT_RAISE_PRICE_CEILING");
  }
  if (requestedMaximumCalls < Number(approval.call_count || 0) || requestedMaximumCalls < Number(approval.maximum_calls || 0)) {
    throw new Error("CREATIVE_TRIBUNAL_CONTINUATION_CALL_CEILING_REGRESSION");
  }
  if (approval.media_generation_authorized === true || approval.publication_authorized === true || approval.external_fallback_allowed === true) {
    throw new Error("CREATIVE_TRIBUNAL_CONTINUATION_AUTHORITY_EXPANSION_FORBIDDEN");
  }

  const now = new Date();
  const continued = {
    ...approval,
    approved: true,
    status: "APPROVED",
    maximum_calls: requestedMaximumCalls,
    remaining_customer_price: Number(Math.max(0, requestedMaximumPrice - Number(approval.spent_customer_price || 0)).toFixed(6)),
    completed_at: null,
    expires_at: new Date(now.getTime() + DIRECTION_IN_PROGRESS_CONTINUATION_WINDOW_MS).toISOString(),
    continuation_authorized_at: now.toISOString(),
    continuation_authorization_source: text(authorization_source) || "USER_EXPLICIT_APPROVAL",
    retry_required: false,
    execution_error: null,
  };
  await updateApproval(project, approval, continued, approvalChannel("CREATIVE_DYNAMIC_TRIBUNAL_CONTINUATION"));
  return continued;
}

installCreativeDirectionCostApprovalGate();
