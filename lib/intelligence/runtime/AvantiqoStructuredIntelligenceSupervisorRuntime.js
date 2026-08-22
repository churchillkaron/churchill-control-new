import {
  AvantiqoIntelligenceReasoningRuntime,
} from "./AvantiqoIntelligenceReasoningRuntime";

const CONTRACT = "AVANTIQO_STRUCTURED_INTELLIGENCE_SUPERVISOR_V1";

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

async function phase({
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
    system,
    messages,
    tools,
    authorization,
    metadata: {
      ...object(metadata),
      structured_supervisor_contract: CONTRACT,
      structured_supervisor_phase: name,
      structured_supervisor_mode: mode,
    },
    temperature: mode === "fast" ? 0.1 : 0.2,
    max_output_tokens,
    max_turns: mode === "fast" ? 4 : 8,
    max_tool_calls: mode === "fast" ? 6 : 20,
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

  const initial = await phase({
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
  const initialParsed = parseJson(initial.text);
  if (!initialParsed) {
    throw new Error("AVANTIQO_STRUCTURED_SUPERVISOR_INVALID_INITIAL_JSON");
  }

  if (normalizedMode === "fast") {
    return {
      success: true,
      contract: CONTRACT,
      mode: normalizedMode,
      parsed: initialParsed,
      text: initial.text,
      repaired: false,
      phases: { reason_act_observe: initial, critique_repair: null },
    };
  }

  const critique = text(critique_instructions, 12000) || [
    "Critique the previous JSON response against the user's current goal and every verified observation.",
    "Repair unsupported claims, missed constraints, unsafe execution choices, weak plans, false completion claims, and unresolved blockers.",
    "Do not change the required JSON schema. Use governed tools if another observation is necessary. Return only the corrected JSON object.",
  ].join(" ");

  const repaired = await phase({
    organization_id,
    party_id,
    entity_id,
    system,
    messages: [
      ...conversation,
      { role: "assistant", content: JSON.stringify(initialParsed) },
      { role: "user", content: critique },
    ],
    tools,
    authorization,
    metadata,
    mode: normalizedMode,
    name: "critique_repair",
    max_output_tokens: tokenBudget,
  });
  const repairedParsed = parseJson(repaired.text);
  if (!repairedParsed) {
    throw new Error("AVANTIQO_STRUCTURED_SUPERVISOR_INVALID_REPAIR_JSON");
  }

  return {
    success: true,
    contract: CONTRACT,
    mode: normalizedMode,
    parsed: repairedParsed,
    text: repaired.text,
    repaired: true,
    phases: { reason_act_observe: initial, critique_repair: repaired },
  };
}

export const AvantiqoStructuredIntelligenceSupervisorRuntime = Object.freeze({
  contract: CONTRACT,
  run: runStructuredIntelligenceSupervisor,
});
