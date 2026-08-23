import {
  AvantiqoIntelligenceReasoningRuntime,
} from "./AvantiqoIntelligenceReasoningRuntime";

const CONTRACT = "AVANTIQO_STRUCTURED_INTELLIGENCE_SUPERVISOR_V2";

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
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
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
    temperature: mode === "fast" ? 0.1 : 0.2,
    max_output_tokens,
    max_turns: mode === "fast" ? 4 : 8,
    max_tool_calls: mode === "fast" ? 6 : 20,
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
        content: "Compile the verified decision brief into the exact JSON contract requested by the system instructions. Return JSON only.",
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
  const normalizedMode = text(mode, 40).toLowerCase() === "fast" ? "fast" : "deep";
  const conversation = list(messages)
    .filter((message) => message && typeof message === "object")
    .slice(-24)
    .map((message) => ({ ...message }));
  if (!conversation.length) {
    throw new Error("AVANTIQO_STRUCTURED_SUPERVISOR_MESSAGES_REQUIRED");
  }
  const tokenBudget = Math.max(
    128,
    Math.min(8192, Number(max_output_tokens) || (normalizedMode === "fast" ? 900 : 2200)),
  );

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
    parsed,
    text: compiled.text,
    decision_brief: decisionBrief,
    repaired: Boolean(critiqueRepair),
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
