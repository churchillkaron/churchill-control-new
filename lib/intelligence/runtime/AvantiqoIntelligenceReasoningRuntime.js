import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  createIntelligenceToolRegistry,
} from "./IntelligenceToolRegistry";
import {
  createAvantiqoResearchMarginalUtilityTracker,
} from "./AvantiqoResearchMarginalUtilityRuntime.mjs";
import {
  resolveAvantiqoInvocationEpistemicRoles,
} from "./AvantiqoInvocationEpistemicRoleRuntime.mjs";
import {
  resolveAvantiqoResearchEvidencePayload,
} from "./AvantiqoResearchEvidencePayloadRuntime.mjs";

const CONTRACT = "AVANTIQO_INTELLIGENCE_REASONING_LOOP_V1";
const OWNED_PROVIDER = "avantiqo-intelligence";
const REASONING_CAPABILITY = "ai.reasoning.execute";
const FAST_TEXT_CAPABILITY = "ai.text.generate";
const LANE_SERVICE_ID = Object.freeze({
  fast: FAST_TEXT_CAPABILITY,
  deep: REASONING_CAPABILITY,
});
const LANE_SERVICE_POLICY = "FAST_TEXT_DEEP_REASONING_V1";
const LOCAL_REVIEW_SCOPE = "BENCHMARK_REVIEW_PREVIEW";
const SAFE_EPISTEMIC_EVIDENCE_SUMMARY_CONTRACT =
  "AVANTIQO_SAFE_EPISTEMIC_EVIDENCE_SUMMARY_V1";
const EXECUTION_LANES = new Set(["fast", "deep"]);
const DEFAULT_MAX_TURNS = 8;
const MAX_TURNS = 20;
const DEFAULT_MAX_TOOL_CALLS = 16;
const MAX_TOOL_CALLS = 64;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const PENDING_SETTLEMENT_POLL_INTERVAL_MS = 1000;
const PENDING_SETTLEMENT_MAX_POLLS = 300;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedInteger(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return fallback;
  return Math.min(number, maximum);
}

function safeCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(1000, Math.floor(number));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sourceHost(value) {
  try {
    const parsed = new URL(text(value));
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function normalizeExecutionLane(value) {
  const lane = text(value).toLowerCase() || "deep";
  if (!EXECUTION_LANES.has(lane)) {
    throw new Error(`AVANTIQO_INTELLIGENCE_EXECUTION_LANE_INVALID:${lane}`);
  }
  return lane;
}

function serviceIdForExecutionLane(lane) {
  const serviceId = LANE_SERVICE_ID[lane];
  if (!serviceId) {
    throw new Error(`AVANTIQO_INTELLIGENCE_EXECUTION_SERVICE_UNRESOLVED:${lane}`);
  }
  return serviceId;
}

function localDevelopmentOwnedReviewPolicy() {
  if (text(process.env.NODE_ENV).toLowerCase() !== "development") return {};
  return {
    execution_scope: LOCAL_REVIEW_SCOPE,
    benchmark_only: true,
    owned_only_required: true,
    external_fallback_allowed: false,
  };
}

function parseArguments(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  const source = text(raw);
  if (!source) return {};
  try {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("arguments must be a JSON object");
    }
    return parsed;
  } catch (error) {
    const wrapped = new Error("AVANTIQO_INTELLIGENCE_TOOL_ARGUMENTS_INVALID_JSON");
    wrapped.cause = error;
    throw wrapped;
  }
}

function outputEnvelope(execution = {}) {
  const first = object(execution?.output);
  const second = object(first.output);
  return Object.keys(second).length ? second : first;
}

function toolCallsFrom(execution = {}) {
  return list(outputEnvelope(execution).tool_calls);
}

function finalTextFrom(execution = {}) {
  return text(outputEnvelope(execution).text);
}

function finishReasonFrom(execution = {}) {
  return text(outputEnvelope(execution).finish_reason) || null;
}

function assistantToolCallMessage(toolCalls) {
  return {
    role: "assistant",
    content: null,
    tool_calls: toolCalls.map((call) => ({
      id: text(call?.id) || undefined,
      type: "function",
      function: {
        name: text(call?.function?.name),
        arguments: typeof call?.function?.arguments === "string"
          ? call.function.arguments
          : JSON.stringify(object(call?.function?.arguments)),
      },
    })),
  };
}

function stableJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      ok: false,
      code: "AVANTIQO_INTELLIGENCE_TOOL_RESULT_NOT_SERIALIZABLE",
    });
  }
}

function toolResultMessage(call, result, maxChars = 24000) {
  const serialized = stableJson(result);
  const content = serialized.length > maxChars
    ? `${serialized.slice(0, maxChars)}\n[TRUNCATED]`
    : serialized;
  return {
    role: "tool",
    tool_call_id: text(call?.id) || undefined,
    name: text(call?.function?.name) || undefined,
    content,
  };
}

function toolOutcome(result = {}) {
  const value = object(result);
  if (value.ok === true) return "succeeded";
  if (value.blocked === true) return "blocked";
  return "failed";
}

function safeEpistemicEvidenceSummary(result = {}, marginalUtility = null) {
  const payload = object(resolveAvantiqoResearchEvidencePayload(result));
  if (!Object.keys(payload).length) return null;

  const evidence = object(payload.evidence);
  const mechanismQuality = object(payload.mechanism_quality);
  const knowledgeReuse = object(payload.knowledge_reuse);
  const evidenceGraph = object(payload.evidence_graph);
  const governance = object(payload.governance);
  const sources = list(payload.sources);
  const claims = list(payload.claims);
  const independentHosts = new Set(
    sources
      .map((source) => sourceHost(source?.url || source?.source_url || source?.final_url))
      .filter(Boolean),
  );
  const sourceBackedClaims = claims.filter((claim) => {
    const verificationStatus = text(claim?.verification_status).toUpperCase();
    return list(claim?.source_urls || claim?.sourceUrls || claim?.sources).length > 0 ||
      verificationStatus === "SOURCE_BACKED" ||
      verificationStatus === "AVANTIQO_CANONICAL_PRODUCT" ||
      verificationStatus.startsWith("HYBRID_VERIFIED");
  }).length;
  const conflictedClaims = claims.filter(
    (claim) => text(claim?.status).toUpperCase() === "CONFLICTED",
  ).length;
  const providerSourceCount = Math.max(
    safeCount(evidence.provider_source_count),
    safeCount(evidence.returned_source_count),
  );
  const sourceCount = Math.max(sources.length, providerSourceCount);
  const conflictCount = Math.max(
    conflictedClaims,
    safeCount(evidenceGraph.conflicted_claim_count),
    safeCount(evidenceGraph.relevant_conflict_count),
  );
  const canonicalAuthority =
    governance.canonical_internal_product_authority === true ||
    text(evidence.authority).toUpperCase() === "AVANTIQO_CANONICAL_PRODUCT" ||
    text(payload.status).toUpperCase() === "CANONICAL_PRODUCT_KNOWLEDGE_REUSED";
  const verifiedKnowledgeReuse =
    text(payload.status).toUpperCase() === "HYBRID_VERIFIED_KNOWLEDGE_REUSED" ||
    (
      knowledgeReuse.reused === true &&
      claims.some((claim) => text(claim?.verification_status).toUpperCase().startsWith("HYBRID_VERIFIED"))
    );
  const hasResearchShape = Boolean(
    sourceCount ||
    claims.length ||
    list(payload.uncertainty).length ||
    list(payload.follow_up_queries || payload.followUpQueries).length ||
    Object.keys(mechanismQuality).length ||
    Object.keys(knowledgeReuse).length ||
    Object.keys(evidenceGraph).length ||
    canonicalAuthority ||
    verifiedKnowledgeReuse,
  );
  if (!hasResearchShape) return null;

  const marginal = object(marginalUtility);
  return {
    contract: SAFE_EPISTEMIC_EVIDENCE_SUMMARY_CONTRACT,
    source_count: safeCount(sourceCount),
    independent_source_count: safeCount(independentHosts.size),
    official_primary_source_count: safeCount(
      sources.filter((source) => source?.official === true && source?.primary === true).length,
    ),
    claim_count: safeCount(claims.length),
    source_backed_claim_count: safeCount(sourceBackedClaims),
    unresolved_uncertainty_count: safeCount(list(payload.uncertainty).length),
    follow_up_query_count: safeCount(list(payload.follow_up_queries || payload.followUpQueries).length),
    conflict_count: safeCount(conflictCount),
    provider_search_observed: evidence.web_search_observed === true,
    quality_verified: mechanismQuality.verified === true,
    canonical_authority: canonicalAuthority,
    verified_knowledge_reuse: verifiedKnowledgeReuse,
    marginal_utility_contract: text(marginal.marginal_utility_contract) || null,
    research_round: safeCount(marginal.research_round),
    marginal_comparison_available: marginal.marginal_comparison_available === true,
    marginal_new_source_count: safeCount(marginal.marginal_new_source_count),
    marginal_new_independent_source_count: safeCount(marginal.marginal_new_independent_source_count),
    marginal_new_source_backed_claim_count: safeCount(marginal.marginal_new_source_backed_claim_count),
    marginal_uncertainty_reduction_count: safeCount(marginal.marginal_uncertainty_reduction_count),
    marginal_follow_up_reduction_count: safeCount(marginal.marginal_follow_up_reduction_count),
    marginal_conflict_reduction_count: safeCount(marginal.marginal_conflict_reduction_count),
    raw_research_persisted: false,
  };
}

function toolSemantics(registry, name) {
  const toolName = text(name);
  let semantics = null;
  if (typeof registry?.semantics === "function") {
    semantics = registry.semantics(toolName);
  } else if (typeof registry?.resolve === "function") {
    const resolved = registry.resolve(toolName);
    if (resolved) {
      semantics = {
        mutates: resolved.mutates === true,
        epistemic_roles: list(resolved.epistemic_roles),
      };
    }
  }
  const normalized = object(semantics);
  return {
    mutates: normalized.mutates === true,
    epistemic_roles: [...new Set(
      list(normalized.epistemic_roles)
        .map((role) => text(role).toLowerCase())
        .filter(Boolean),
    )].slice(0, 8),
  };
}

function invocationEpistemicRoles({ registry, toolName, args = {} } = {}) {
  const semantics = toolSemantics(registry, toolName);
  return resolveAvantiqoInvocationEpistemicRoles({
    tool_name: toolName,
    capability_key: object(args).capability_key,
    static_roles: semantics.epistemic_roles,
  });
}

function recordToolOutcome(transcript, {
  callId = null,
  toolName = null,
  outcome,
  code = null,
  epistemicRoles = null,
  epistemicEvidence = null,
} = {}) {
  const currentTurn = transcript[transcript.length - 1];
  if (!currentTurn) return;
  const calls = list(currentTurn.tool_calls);
  const normalizedCallId = text(callId);
  const normalizedToolName = text(toolName);
  const matched = calls.find((call) => {
    if (normalizedCallId && text(call?.id) === normalizedCallId) return true;
    return !normalizedCallId &&
      text(call?.name) === normalizedToolName &&
      text(call?.outcome) === "pending";
  });
  if (!matched) return;
  matched.outcome = text(outcome, 40) || "failed";
  matched.code = text(code, 160) || null;
  if (Array.isArray(epistemicRoles)) {
    matched.epistemic_roles = [...epistemicRoles];
  }
  matched.epistemic_evidence = epistemicEvidence
    ? { ...object(epistemicEvidence) }
    : null;
}

function normalizeMessages({ system, messages, input }) {
  const normalized = [];
  if (text(system)) normalized.push({ role: "system", content: text(system) });
  for (const message of list(messages)) {
    if (!message || typeof message !== "object") continue;
    normalized.push({ ...message });
  }
  if (!normalized.length && text(input)) {
    normalized.push({ role: "user", content: text(input) });
  }
  return normalized;
}

function normalizeRegistry(tools) {
  if (tools && typeof tools.descriptors === "function" && typeof tools.execute === "function") {
    return tools;
  }
  return createIntelligenceToolRegistry(list(tools));
}

function validateScope({ organization_id, messages }) {
  if (!text(organization_id)) {
    throw new Error("AVANTIQO_INTELLIGENCE_ORGANIZATION_SCOPE_REQUIRED");
  }
  if (!messages.length) {
    throw new Error("AVANTIQO_INTELLIGENCE_REASONING_INPUT_REQUIRED");
  }
}

async function settlePendingReasoningExecution({
  organization_id,
  execution,
  executionService,
  executionLane,
  metadata,
} = {}) {
  if (execution?.pending !== true) return execution;

  const provider = text(execution?.provider) || OWNED_PROVIDER;
  const providerJobId = text(execution?.provider_job_id);
  const usageId = text(execution?.usage?.id);
  if (!providerJobId || !usageId) {
    throw new Error("AVANTIQO_INTELLIGENCE_PENDING_SETTLEMENT_BINDING_REQUIRED");
  }

  for (let poll = 1; poll <= PENDING_SETTLEMENT_MAX_POLLS; poll += 1) {
    const settled = await ServiceExecutionRuntime.settle({
      organization_id,
      provider,
      provider_job_id: providerJobId,
      usage_id: usageId,
      pricing: object(execution?.pricing),
      quantity: execution?.usage?.quantity ?? 1,
      unit: execution?.usage?.unit || execution?.pricing?.unit || "request",
      metadata: {
        ...object(metadata),
        module: object(metadata).module || "INTELLIGENCE",
        operation: "AVANTIQO_INTELLIGENCE_REASONING_LOOP_SETTLEMENT",
        intelligence_contract: CONTRACT,
        intelligence_execution_lane: executionLane,
        intelligence_service_id: executionService,
        intelligence_capability: executionService,
        intelligence_lane_service_policy: LANE_SERVICE_POLICY,
        provider_job_reused: true,
        duplicate_provider_job_submitted: false,
        pending_settlement_poll: poll,
        raw_reasoning_persisted: false,
      },
      provider_status_input: {
        capability: executionService,
        execution_lane: executionLane,
      },
      credential_id: execution?.credential_id || null,
      started_at: execution?.started_at || null,
    });

    if (settled?.pending === true) {
      if (poll < PENDING_SETTLEMENT_MAX_POLLS) {
        await sleep(PENDING_SETTLEMENT_POLL_INTERVAL_MS);
      }
      continue;
    }
    if (settled?.failed === true || settled?.success !== true) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_PENDING_SETTLEMENT_FAILED:${text(settled?.error) || "UNKNOWN"}`,
      );
    }
    return settled;
  }

  throw new Error("AVANTIQO_INTELLIGENCE_PENDING_SETTLEMENT_TIMEOUT");
}

export async function runIntelligenceReasoningLoop({
  organization_id,
  party_id = null,
  entity_id = null,
  messages = [],
  input = null,
  system = null,
  tools = [],
  authorization = {},
  metadata = {},
  model = null,
  execution_lane = "deep",
  temperature = 0.2,
  response_format = null,
  max_output_tokens = DEFAULT_MAX_OUTPUT_TOKENS,
  max_turns = DEFAULT_MAX_TURNS,
  max_tool_calls = DEFAULT_MAX_TOOL_CALLS,
} = {}) {
  const conversation = normalizeMessages({ system, messages, input });
  validateScope({ organization_id, messages: conversation });
  const executionLane = normalizeExecutionLane(execution_lane);
  const executionService = serviceIdForExecutionLane(executionLane);

  const registry = normalizeRegistry(tools);
  const toolDescriptors = registry.descriptors();
  const turnLimit = boundedInteger(max_turns, DEFAULT_MAX_TURNS, MAX_TURNS);
  const toolCallLimit = boundedInteger(max_tool_calls, DEFAULT_MAX_TOOL_CALLS, MAX_TOOL_CALLS);
  const seenCallIds = new Set();
  const transcript = [];
  const researchMarginalUtility = createAvantiqoResearchMarginalUtilityTracker();
  const localReviewPolicy = localDevelopmentOwnedReviewPolicy();
  let totalToolCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let turn = 1; turn <= turnLimit; turn += 1) {
    let execution = await ServiceExecutionRuntime.execute({
      organization_id,
      party_id,
      entity_id,
      service_id: executionService,
      provider_id: OWNED_PROVIDER,
      capability: executionService,
      provider_policy: {
        allowed_providers: [OWNED_PROVIDER],
        ...localReviewPolicy,
      },
      input: {
        ...(model ? { model } : {}),
        messages: conversation,
        ...(toolDescriptors.length ? { tools: toolDescriptors, tool_choice: "auto" } : {}),
        ...(response_format ? { response_format: object(response_format) } : {}),
        execution_lane: executionLane,
        temperature,
        max_output_tokens,
      },
      metadata: {
        ...object(metadata),
        module: object(metadata).module || "INTELLIGENCE",
        operation: "AVANTIQO_INTELLIGENCE_REASONING_LOOP",
        intelligence_contract: CONTRACT,
        intelligence_execution_lane: executionLane,
        intelligence_service_id: executionService,
        intelligence_capability: executionService,
        intelligence_lane_service_policy: LANE_SERVICE_POLICY,
        reasoning_turn: turn,
        ...(localReviewPolicy.execution_scope
          ? {
              execution_scope: LOCAL_REVIEW_SCOPE,
              benchmark_only: true,
              production_certified: false,
              local_development_owned_intelligence_preview: true,
            }
          : {}),
      },
      category: "AI",
    });

    execution = await settlePendingReasoningExecution({
      organization_id,
      execution,
      executionService,
      executionLane,
      metadata: {
        ...object(metadata),
        reasoning_turn: turn,
      },
    });

    const output = outputEnvelope(execution);
    totalInputTokens += Number(output?.usage?.input_tokens || execution?.usage?.input_tokens || 0);
    totalOutputTokens += Number(output?.usage?.output_tokens || execution?.usage?.output_tokens || 0);
    const calls = toolCallsFrom(execution);
    const finalText = finalTextFrom(execution);

    transcript.push({
      turn,
      provider: execution?.provider || OWNED_PROVIDER,
      model: execution?.model || model || null,
      execution_lane: executionLane,
      service_id: executionService,
      capability: executionService,
      finish_reason: finishReasonFrom(execution),
      tool_calls: calls.map((call) => {
        const name = text(call?.function?.name) || null;
        const semantics = toolSemantics(registry, name);
        return {
          id: text(call?.id) || null,
          name,
          mutates: semantics.mutates,
          epistemic_roles: semantics.epistemic_roles,
          outcome: "pending",
          code: null,
          epistemic_evidence: null,
        };
      }),
      text_present: Boolean(finalText),
    });

    if (!calls.length) {
      if (!finalText) {
        throw new Error("AVANTIQO_INTELLIGENCE_REASONING_LOOP_EMPTY_FINAL_OUTPUT");
      }
      return {
        success: true,
        contract: CONTRACT,
        organization_id,
        provider: execution?.provider || OWNED_PROVIDER,
        model: execution?.model || model || null,
        execution_lane: executionLane,
        service_id: executionService,
        capability: executionService,
        lane_service_policy: LANE_SERVICE_POLICY,
        text: finalText,
        finish_reason: finishReasonFrom(execution),
        turns: turn,
        tool_calls_executed: totalToolCalls,
        usage: {
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
        },
        transcript,
      };
    }

    if (totalToolCalls + calls.length > toolCallLimit) {
      throw new Error("AVANTIQO_INTELLIGENCE_TOOL_CALL_LIMIT_EXCEEDED");
    }

    conversation.push(assistantToolCallMessage(calls));

    for (const call of calls) {
      const callId = text(call?.id);
      const toolName = text(call?.function?.name);
      if (!toolName) {
        throw new Error("AVANTIQO_INTELLIGENCE_TOOL_CALL_NAME_REQUIRED");
      }
      if (callId) {
        if (seenCallIds.has(callId)) {
          throw new Error(`AVANTIQO_INTELLIGENCE_TOOL_CALL_REPLAY_DETECTED:${callId}`);
        }
        seenCallIds.add(callId);
      }

      let args;
      try {
        args = parseArguments(call?.function?.arguments);
      } catch (error) {
        const invalidArguments = {
          ok: false,
          blocked: true,
          code: "AVANTIQO_INTELLIGENCE_TOOL_ARGUMENTS_INVALID_JSON",
          tool: toolName,
        };
        recordToolOutcome(transcript, {
          callId,
          toolName,
          outcome: "blocked",
          code: invalidArguments.code,
        });
        conversation.push(toolResultMessage(call, invalidArguments));
        totalToolCalls += 1;
        continue;
      }

      const invocationRoles = invocationEpistemicRoles({
        registry,
        toolName,
        args,
      });
      const result = await registry.execute({
        name: toolName,
        arguments: args,
        context: {
          organization_id,
          party_id,
          entity_id,
          reasoning_contract: CONTRACT,
          reasoning_turn: turn,
          tool_call_id: callId || null,
        },
        authorization: object(authorization),
      });
      const marginalUtility =
        toolOutcome(result) === "succeeded" && invocationRoles.includes("research")
          ? researchMarginalUtility.observe(result)
          : null;
      recordToolOutcome(transcript, {
        callId,
        toolName,
        outcome: toolOutcome(result),
        code: result?.code || null,
        epistemicRoles: invocationRoles,
        epistemicEvidence: safeEpistemicEvidenceSummary(result, marginalUtility),
      });
      totalToolCalls += 1;
      conversation.push(toolResultMessage(call, result, result.max_result_chars));
    }
  }

  throw new Error("AVANTIQO_INTELLIGENCE_REASONING_TURN_LIMIT_EXCEEDED");
}

export const AvantiqoIntelligenceReasoningRuntime = Object.freeze({
  contract: CONTRACT,
  evidenceSummaryContract: SAFE_EPISTEMIC_EVIDENCE_SUMMARY_CONTRACT,
  laneServicePolicy: LANE_SERVICE_POLICY,
  laneServiceIds: LANE_SERVICE_ID,
  run: runIntelligenceReasoningLoop,
  createToolRegistry: createIntelligenceToolRegistry,
});

export default AvantiqoIntelligenceReasoningRuntime;