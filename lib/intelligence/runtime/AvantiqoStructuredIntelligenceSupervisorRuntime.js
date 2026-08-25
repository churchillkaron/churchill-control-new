import {
  AvantiqoIntelligenceReasoningRuntime,
} from "./AvantiqoIntelligenceReasoningRuntime";
import {
  compactProductRepositoryAssessmentConversation,
} from "./AvantiqoProductRepositoryAssessmentPromptCompactor";

const CONTRACT = "AVANTIQO_STRUCTURED_INTELLIGENCE_SUPERVISOR_V2";
const SUPERVISOR_MODES = new Set(["fast", "balanced", "deep"]);
const PRODUCT_BALANCED_OPERATIONS = new Set([
  "PRODUCT_REPOSITORY_ASSESSMENT",
  "PRODUCT_PERSISTENCE_DECISION",
]);
const PRODUCT_REPOSITORY_EVIDENCE_QUERY_PLAN_OPERATION =
  "PRODUCT_REPOSITORY_EVIDENCE_QUERY_PLAN";

function text(value, limit = 50000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeMode(value) {
  const candidate = text(value, 40).toLowerCase();
  return SUPERVISOR_MODES.has(candidate) ? candidate : "deep";
}

function operationName(metadata = {}) {
  return text(object(metadata).operation, 120);
}

function effectiveMode(mode, metadata = {}) {
  const requested = normalizeMode(mode);
  if (
    requested === "deep" &&
    PRODUCT_BALANCED_OPERATIONS.has(operationName(metadata))
  ) {
    return "balanced";
  }
  return requested;
}

function tokenBudgetFor(mode, requested) {
  const fallback = mode === "fast" ? 900 : mode === "balanced" ? 1600 : 2200;
  return Math.max(128, Math.min(8192, Number(requested) || fallback));
}

function singlePassProductTokenBudget(metadata, requested) {
  const operation = operationName(metadata);
  const minimum = operation === "PRODUCT_REPOSITORY_ASSESSMENT"
    ? 2200
    : operation === "PRODUCT_PERSISTENCE_DECISION"
      ? 8192
      : 0;
  return Math.max(
    128,
    Math.min(16384, Math.max(Number(requested) || 0, minimum)),
  );
}

function deterministicProductEvidenceQueryPlan(metadata = {}) {
  if (operationName(metadata) !== PRODUCT_REPOSITORY_EVIDENCE_QUERY_PLAN_OPERATION) {
    return null;
  }
  return {
    search_queries: [],
    rationale:
      "Use the repository assessment's canonical bounded deterministic search set directly. Model-generated search planning is intentionally skipped because it has no authorization effect and must not block an interactive Product Engineering Cycle.",
    evidence_limits: [
      "Deterministic repository searches remain bounded and read-only.",
      "Search hits are hypotheses until surrounding current-main source is read.",
      "The final Product repository assessment still requires Avantiqo-owned Intelligence reasoning over current-main evidence.",
    ],
  };
}

function reasoningLimits(mode) {
  if (mode === "fast") {
    return { temperature: 0.1, max_turns: 4, max_tool_calls: 6 };
  }
  if (mode === "balanced") {
    return { temperature: 0.15, max_turns: 6, max_tool_calls: 12 };
  }
  return { temperature: 0.2, max_turns: 8, max_tool_calls: 20 };
}

function parseJson(value) {
  const source = text(value).replace(/^\uFEFF/, "");
  if (!source) return null;
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue.
    }
  }
  return null;
}

function naturalReasoningSystem(system) {
  return [
    text(system, 50000),
    "Think through the goal naturally. Do not force your reasoning into JSON or any schema.",
    "Use governed tools when they materially improve correctness. Distinguish facts, assumptions, recommendations, blockers and completed actions.",
    "Do not expose private chain-of-thought. Return only a concise decision brief containing the conclusions and evidence needed by the next machine-boundary compiler.",
  ].join("\n");
}

function compilerSystem(system) {
  return [
    text(system, 50000),
    "You are the machine-boundary compiler for Avantiqo Intelligence.",
    "Do not perform new strategic reasoning. Do not use tools. Convert the supplied verified decision brief into the caller's required JSON contract.",
    "Preserve uncertainty and evidence gaps exactly. Never invent facts, approvals, execution results, capabilities or completed work.",
    "Return only one valid JSON object with no markdown or explanatory prose.",
  ].join("\n");
}

function singlePassProductSystem(system, critiqueInstructions) {
  const critique = text(critiqueInstructions, 12000);
  return [
    text(system, 50000),
    "Analyze the bounded Product evidence carefully and directly using the owned non-thinking fast lane.",
    "Do not emit private chain-of-thought, hidden reasoning, reasoning_content, or <think> content.",
    "The final answer is a machine boundary: emit exactly one valid JSON object matching the caller's requested contract, with no markdown or explanatory prose outside it.",
    "Preserve uncertainty and evidence limits. Never invent facts, approvals, execution results, capabilities or completed work.",
    critique
      ? `Before finalizing the JSON, verify the result against these constraints: ${critique}`
      : "Before finalizing the JSON, verify every claim against the supplied evidence and caller constraints.",
  ].join("\n");
}

async function reasoningPhase({
  organization_id,
  party_id,
  entity_id,
  system,
  messages,
  tools,
  authorization,
  metadata,
  mode,
  name,
  max_output_tokens,
}) {
  const limits = reasoningLimits(mode);
  return AvantiqoIntelligenceReasoningRuntime.run({
    organization_id,
    party_id,
    entity_id,
    system: naturalReasoningSystem(system),
    messages,
    tools,
    authorization,
    metadata: {
      ...object(metadata),
      structured_supervisor_contract: CONTRACT,
      structured_supervisor_phase: name,
      structured_supervisor_mode: mode,
      structured_boundary_compilation: false,
    },
    temperature: limits.temperature,
    max_output_tokens,
    max_turns: limits.max_turns,
    max_tool_calls: limits.max_tool_calls,
  });
}

async function singlePassProductPhase({
  organization_id,
  party_id,
  entity_id,
  system,
  conversation,
  authorization,
  metadata,
  critique_instructions,
  max_output_tokens,
}) {
  return AvantiqoIntelligenceReasoningRuntime.run({
    organization_id,
    party_id,
    entity_id,
    system: singlePassProductSystem(system, critique_instructions),
    messages: conversation,
    tools: [],
    authorization: {
      ...object(authorization),
      allow_mutating_tools: false,
    },
    metadata: {
      ...object(metadata),
      structured_supervisor_contract: CONTRACT,
      structured_supervisor_phase: "reason_and_contract",
      structured_supervisor_mode: "product_single_pass",
      structured_boundary_compilation: true,
      private_reasoning_transport_expected: false,
      bounded_non_thinking_fast_lane: true,
      raw_reasoning_persisted: false,
    },
    execution_lane: "fast",
    temperature: 0.15,
    response_format: { type: "json_object" },
    max_output_tokens,
    max_turns: 1,
    max_tool_calls: 1,
  });
}

async function directStructuredPhase({
  organization_id,
  party_id,
  entity_id,
  system,
  conversation,
  metadata,
  max_output_tokens,
}) {
  return AvantiqoIntelligenceReasoningRuntime.run({
    organization_id,
    party_id,
    entity_id,
    system: [
      text(system, 50000),
      "This is a bounded machine-boundary planning task, not a strategic Product decision.",
      "Return exactly one valid JSON object matching the requested contract and nothing else.",
    ].join("\n"),
    messages: conversation,
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      ...object(metadata),
      structured_supervisor_contract: CONTRACT,
      structured_supervisor_phase: "direct_machine_boundary",
      structured_supervisor_mode: "direct_machine_boundary",
      structured_boundary_compilation: true,
      strategic_reasoning_skipped: true,
    },
    temperature: 0.1,
    response_format: { type: "json_object" },
    max_output_tokens: Math.max(128, Math.min(1200, max_output_tokens)),
    max_turns: 1,
    max_tool_calls: 1,
  });
}

async function compilerPhase({
  organization_id,
  party_id,
  entity_id,
  system,
  conversation,
  brief,
  metadata,
  name,
  max_output_tokens,
}) {
  return AvantiqoIntelligenceReasoningRuntime.run({
    organization_id,
    party_id,
    entity_id,
    system: compilerSystem(system),
    messages: [
      ...conversation,
      {
        role: "assistant",
        content: `VERIFIED_DECISION_BRIEF\n${text(brief, 24000)}`,
      },
      {
        role: "user",
        content:
          "Compile the verified decision brief into the exact JSON contract requested by the system instructions. Return JSON only.",
      },
    ],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      ...object(metadata),
      structured_supervisor_contract: CONTRACT,
      structured_supervisor_phase: name,
      structured_supervisor_mode: "boundary_compiler",
      structured_boundary_compilation: true,
    },
    temperature: 0.1,
    response_format: { type: "json_object" },
    max_output_tokens: Math.max(128, Math.min(1600, max_output_tokens)),
    max_turns: 1,
    max_tool_calls: 1,
  });
}

export async function runStructuredIntelligenceSupervisor({
  organization_id,
  party_id = null,
  entity_id = null,
  system,
  messages = [],
  tools = [],
  authorization = {},
  metadata = {},
  mode = "deep",
  critique_instructions = null,
  max_output_tokens = null,
} = {}) {
  if (!text(organization_id, 160)) {
    throw new Error("AVANTIQO_STRUCTURED_SUPERVISOR_ORGANIZATION_REQUIRED");
  }
  if (!text(system, 50000)) {
    throw new Error("AVANTIQO_STRUCTURED_SUPERVISOR_SYSTEM_REQUIRED");
  }

  const requestedMode = normalizeMode(mode);
  const normalizedMode = effectiveMode(requestedMode, metadata);
  const conversation = list(messages)
    .filter((message) => message && typeof message === "object")
    .slice(-24)
    .map((message) => ({ ...message }));
  if (!conversation.length) {
    throw new Error("AVANTIQO_STRUCTURED_SUPERVISOR_MESSAGES_REQUIRED");
  }

  const tokenBudget = tokenBudgetFor(normalizedMode, max_output_tokens);
  const directMachineBoundary = object(metadata).query_plan_only === true;
  const productSinglePass = PRODUCT_BALANCED_OPERATIONS.has(operationName(metadata));
  const productConversation = productSinglePass
    ? compactProductRepositoryAssessmentConversation(conversation, metadata)
    : conversation;
  const deterministicQueryPlan = directMachineBoundary
    ? deterministicProductEvidenceQueryPlan(metadata)
    : null;

  if (deterministicQueryPlan) {
    const deterministicText = JSON.stringify(deterministicQueryPlan);
    const deterministicPhase = {
      success: true,
      provider: "avantiqo-runtime",
      model: "deterministic-product-evidence-query-plan",
      text: deterministicText,
      usage: { input_tokens: 0, output_tokens: 0 },
      finish_reason: "deterministic",
      deterministic: true,
    };
    return {
      success: true,
      contract: CONTRACT,
      mode: normalizedMode,
      requested_mode: requestedMode,
      parsed: deterministicQueryPlan,
      text: deterministicText,
      decision_brief: null,
      repaired: false,
      direct_machine_boundary: true,
      deterministic_machine_boundary: true,
      single_pass_structured_reasoning: false,
      phases: {
        reason_act_observe: null,
        critique_repair: null,
        contract_compile: deterministicPhase,
      },
    };
  }

  if (directMachineBoundary) {
    const direct = await directStructuredPhase({
      organization_id,
      party_id,
      entity_id,
      system,
      conversation,
      metadata,
      max_output_tokens: tokenBudget,
    });
    const parsed = parseJson(direct.text);
    if (!parsed) {
      throw new Error("AVANTIQO_STRUCTURED_SUPERVISOR_INVALID_COMPILED_JSON");
    }
    return {
      success: true,
      contract: CONTRACT,
      mode: normalizedMode,
      requested_mode: requestedMode,
      parsed,
      text: direct.text,
      decision_brief: null,
      repaired: false,
      direct_machine_boundary: true,
      deterministic_machine_boundary: false,
      single_pass_structured_reasoning: false,
      phases: {
        reason_act_observe: null,
        critique_repair: null,
        contract_compile: direct,
      },
    };
  }

  if (productSinglePass) {
    const singlePass = await singlePassProductPhase({
      organization_id,
      party_id,
      entity_id,
      system,
      conversation: productConversation,
      authorization,
      metadata,
      critique_instructions,
      max_output_tokens: singlePassProductTokenBudget(metadata, tokenBudget),
    });
    const parsed = parseJson(singlePass.text);
    if (!parsed) {
      throw new Error("AVANTIQO_STRUCTURED_SUPERVISOR_INVALID_COMPILED_JSON");
    }
    return {
      success: true,
      contract: CONTRACT,
      mode: normalizedMode,
      requested_mode: requestedMode,
      parsed,
      text: singlePass.text,
      decision_brief: null,
      repaired: false,
      direct_machine_boundary: false,
      deterministic_machine_boundary: false,
      single_pass_structured_reasoning: true,
      phases: {
        reason_act_observe: singlePass,
        critique_repair: null,
        contract_compile: singlePass,
      },
    };
  }

  const initial = await reasoningPhase({
    organization_id,
    party_id,
    entity_id,
    system,
    messages: conversation,
    tools,
    authorization,
    metadata,
    mode: normalizedMode,
    name: "reason_act_observe",
    max_output_tokens: tokenBudget,
  });

  let decisionBrief = initial.text;
  let critiqueRepair = null;
  if (normalizedMode === "deep") {
    const critique = text(critique_instructions, 12000) || [
      "Critique the decision brief against the user's current goal and every verified observation.",
      "Repair unsupported claims, missed constraints, unsafe execution choices, weak plans, false completion claims and unresolved blockers.",
      "Use governed tools if another observation is necessary. Return a concise corrected decision brief, not JSON.",
    ].join(" ");
    critiqueRepair = await reasoningPhase({
      organization_id,
      party_id,
      entity_id,
      system,
      messages: [
        ...conversation,
        { role: "assistant", content: decisionBrief },
        { role: "user", content: critique },
      ],
      tools,
      authorization,
      metadata,
      mode: normalizedMode,
      name: "critique_repair",
      max_output_tokens: tokenBudget,
    });
    decisionBrief = critiqueRepair.text;
  }

  const compiled = await compilerPhase({
    organization_id,
    party_id,
    entity_id,
    system,
    conversation,
    brief: decisionBrief,
    metadata,
    name: "contract_compile",
    max_output_tokens: tokenBudget,
  });
  const parsed = parseJson(compiled.text);
  if (!parsed) {
    throw new Error("AVANTIQO_STRUCTURED_SUPERVISOR_INVALID_COMPILED_JSON");
  }

  return {
    success: true,
    contract: CONTRACT,
    mode: normalizedMode,
    requested_mode: requestedMode,
    parsed,
    text: compiled.text,
    decision_brief: decisionBrief,
    repaired: Boolean(critiqueRepair),
    direct_machine_boundary: false,
    deterministic_machine_boundary: false,
    single_pass_structured_reasoning: false,
    phases: {
      reason_act_observe: initial,
      critique_repair: critiqueRepair,
      contract_compile: compiled,
    },
  };
}

export const AvantiqoStructuredIntelligenceSupervisorRuntime = Object.freeze({
  contract: CONTRACT,
  run: runStructuredIntelligenceSupervisor,
});
