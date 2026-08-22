import {
  AvantiqoIntelligenceReasoningRuntime,
} from "./AvantiqoIntelligenceReasoningRuntime";

const CONTRACT = "AVANTIQO_INTELLIGENCE_SUPERVISOR_V1";
const FAST_MODE = "fast";
const DEEP_MODE = "deep";
const MAX_MEMORY_ITEMS = 12;

function text(value, limit = 12000) {
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
  return text(value, 40).toLowerCase() === FAST_MODE ? FAST_MODE : DEEP_MODE;
}

function parseJson(value) {
  const source = text(value, 50000).replace(/^\uFEFF/, "");
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
      // Continue with conservative extraction candidates.
    }
  }
  return null;
}

function boundedMemories(memories = []) {
  return list(memories)
    .slice(0, MAX_MEMORY_ITEMS)
    .map((memory) => ({
      type: text(memory?.type, 80) || null,
      scope: text(memory?.scope, 180) || null,
      subject: text(memory?.subject, 300) || null,
      content: text(memory?.content, 1400),
      importance: Number(memory?.importance || 0),
      confidence: Number(memory?.confidence || 0),
      freshness: text(memory?.freshness, 60) || null,
      requires_live_read: memory?.requires_live_read === true,
    }))
    .filter((memory) => memory.content);
}

function outputContract() {
  return {
    response: "natural final response for the user",
    goal_status: "in_progress|blocked|needs_human|completed",
    confidence: 0.0,
    plan: [
      {
        step: "short step description",
        status: "planned|completed|blocked|skipped",
      },
    ],
    observations: ["verified observation or explicit uncertainty"],
    self_check: {
      passed: true,
      issues: [],
    },
    repair_needed: false,
    next_step: null,
    needs_human: {
      required: false,
      reason: null,
      question: null,
    },
  };
}

function supervisorSystem({ mode, context, memories }) {
  const fast = mode === FAST_MODE;
  return [
    "You are Avantiqo Intelligence, the owned thinking brain of the Avantiqo business operating system.",
    "You are not a provider wrapper and you never discuss provider selection with the user.",
    "Understand the user's goal, preserve continuity, reason before acting, use governed tools for evidence or execution, observe results, and continue until the goal is reached or a genuine human-only decision is required.",
    "Challenge weak assumptions constructively. Distinguish facts, assumptions, recommendations and executed results.",
    "Never invent live business facts, execution results, permissions, approvals, tool outputs or completed work.",
    "Durable memory is continuity context only. Mutable facts marked requires_live_read must be re-read before being stated as current.",
    "A memory, prior decision, recommendation or prior approval never authorizes a new write. Tool governance and current authorization remain authoritative.",
    "When a tool is blocked, reason from the block and either choose a safe alternative, ask for the exact human decision needed, or report the blocker. Never pretend the blocked action happened.",
    fast
      ? "FAST MODE: keep reasoning compact and conversational. Use the minimum tools needed and finish quickly."
      : "DEEP MODE: inspect tradeoffs, use tools when they materially improve correctness, critique the proposed result, and repair weak reasoning before finishing.",
    `Governed context: ${JSON.stringify(object(context))}`,
    `Durable memory context: ${JSON.stringify(boundedMemories(memories))}`,
    `Return exactly one JSON object matching this contract: ${JSON.stringify(outputContract())}`,
    "Do not expose private chain-of-thought. Put only concise conclusions, observations, plan state and self-check issues in the JSON.",
  ].join("\n");
}

function normalizeResult(parsed, fallbackText = "") {
  const value = object(parsed);
  const selfCheck = object(value.self_check);
  const needsHuman = object(value.needs_human);
  const goalStatus = ["in_progress", "blocked", "needs_human", "completed"].includes(
    text(value.goal_status, 40).toLowerCase(),
  )
    ? text(value.goal_status, 40).toLowerCase()
    : needsHuman.required === true
      ? "needs_human"
      : "in_progress";

  return {
    response: text(value.response || fallbackText, 12000),
    goal_status: goalStatus,
    confidence: Math.max(0, Math.min(1, Number(value.confidence ?? 0.5) || 0.5)),
    plan: list(value.plan).slice(0, 12).map((step) => ({
      step: text(step?.step || step?.description || step, 800),
      status: text(step?.status, 40) || "planned",
    })).filter((step) => step.step),
    observations: list(value.observations).slice(0, 16).map((item) => text(item, 1200)).filter(Boolean),
    self_check: {
      passed: selfCheck.passed !== false,
      issues: list(selfCheck.issues).slice(0, 12).map((item) => text(item, 1000)).filter(Boolean),
    },
    repair_needed: value.repair_needed === true || selfCheck.passed === false,
    next_step: text(value.next_step, 1200) || null,
    needs_human: {
      required: needsHuman.required === true,
      reason: text(needsHuman.reason, 1200) || null,
      question: text(needsHuman.question, 1200) || null,
    },
  };
}

async function runPhase({
  organization_id,
  party_id,
  entity_id,
  system,
  messages,
  tools,
  authorization,
  metadata,
  mode,
  phase,
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
      module: object(metadata).module || "INTELLIGENCE",
      operation: "AVANTIQO_INTELLIGENCE_SUPERVISOR",
      supervisor_contract: CONTRACT,
      supervisor_mode: mode,
      supervisor_phase: phase,
    },
    temperature: mode === FAST_MODE ? 0.15 : 0.25,
    max_output_tokens: mode === FAST_MODE ? 1200 : 2800,
    max_turns: mode === FAST_MODE ? 4 : 10,
    max_tool_calls: mode === FAST_MODE ? 6 : 24,
  });
}

export async function runIntelligenceSupervisor({
  organization_id,
  party_id = null,
  entity_id = null,
  goal,
  messages = [],
  context = {},
  memories = [],
  tools = [],
  authorization = {},
  metadata = {},
  mode = DEEP_MODE,
} = {}) {
  const organizationId = text(organization_id, 160);
  const goalText = text(goal, 12000);
  if (!organizationId) throw new Error("AVANTIQO_INTELLIGENCE_SUPERVISOR_ORGANIZATION_REQUIRED");
  if (!goalText) throw new Error("AVANTIQO_INTELLIGENCE_SUPERVISOR_GOAL_REQUIRED");

  const cognitionMode = normalizeMode(mode);
  const conversation = list(messages)
    .filter((message) => message && typeof message === "object")
    .slice(-16)
    .map((message) => ({ ...message }));
  conversation.push({ role: "user", content: goalText });

  const system = supervisorSystem({
    mode: cognitionMode,
    context,
    memories,
  });

  const initial = await runPhase({
    organization_id: organizationId,
    party_id,
    entity_id,
    system,
    messages: conversation,
    tools,
    authorization,
    metadata,
    mode: cognitionMode,
    phase: "reason_act_observe",
  });
  const initialParsed = parseJson(initial.text);
  const initialResult = normalizeResult(initialParsed, initial.text);

  const shouldCritique =
    cognitionMode === DEEP_MODE &&
    initialResult.goal_status !== "needs_human";

  if (!shouldCritique) {
    return {
      success: true,
      contract: CONTRACT,
      mode: cognitionMode,
      result: initialResult,
      phases: {
        reason_act_observe: initial,
        critique_repair: null,
      },
      repaired: false,
    };
  }

  const critiqueMessages = [
    ...conversation,
    {
      role: "assistant",
      content: JSON.stringify(initialResult),
    },
    {
      role: "user",
      content: [
        "Critique the proposed result against the original goal and all verified tool observations.",
        "Check for unsupported claims, missed constraints, weak recommendations, incomplete execution, incorrect completion claims, unresolved blockers, and whether another safe tool call can materially improve the result.",
        "Repair the result now. If the goal is not genuinely complete, do not mark it completed. Use tools when needed and return the same JSON contract.",
      ].join(" "),
    },
  ];

  const repairedPhase = await runPhase({
    organization_id: organizationId,
    party_id,
    entity_id,
    system,
    messages: critiqueMessages,
    tools,
    authorization,
    metadata,
    mode: cognitionMode,
    phase: "critique_repair",
  });
  const repairedParsed = parseJson(repairedPhase.text);
  const repairedResult = normalizeResult(repairedParsed, repairedPhase.text);

  return {
    success: true,
    contract: CONTRACT,
    mode: cognitionMode,
    result: repairedResult,
    phases: {
      reason_act_observe: initial,
      critique_repair: repairedPhase,
    },
    repaired: true,
  };
}

export const AvantiqoIntelligenceSupervisorRuntime = Object.freeze({
  contract: CONTRACT,
  run: runIntelligenceSupervisor,
  modes: Object.freeze({ FAST: FAST_MODE, DEEP: DEEP_MODE }),
});
