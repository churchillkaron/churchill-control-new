import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

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

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function parseJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

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
      // Continue to the next conservative extraction.
    }
  }

  return null;
}

function findText(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findText(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";

  for (const key of ["text", "output_text", "content", "message"]) {
    const direct = value[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
  }

  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findText(value[key], depth + 1);
    if (found) return found;
  }

  return "";
}

const EVIDENCE_CHAR_LIMIT = 6000;
const EVIDENCE_SAMPLE_SIZE = 12;

function collectionOf(value) {
  if (Array.isArray(value)) return { rows: value, key: null };

  if (value && typeof value === "object") {
    for (const key of [
      "rows",
      "records",
      "items",
      "sessions",
      "orders",
      "events",
      "receipts",
    ]) {
      if (Array.isArray(value[key])) return { rows: value[key], key };
    }
  }

  return null;
}

function evidenceJson(value) {
  try {
    const collection = collectionOf(value);

    if (collection && collection.rows.length > EVIDENCE_SAMPLE_SIZE) {
      const summary = {
        total_count: collection.rows.length,
        showing: EVIDENCE_SAMPLE_SIZE,
        note: "Sample only. total_count is the true number of rows.",
        sample: collection.rows.slice(0, EVIDENCE_SAMPLE_SIZE),
      };

      return JSON.stringify(
        collection.key
          ? { ...value, [collection.key]: undefined, ...summary }
          : summary,
      ).slice(0, EVIDENCE_CHAR_LIMIT);
    }

    return JSON.stringify(value).slice(0, EVIDENCE_CHAR_LIMIT);
  } catch {
    return JSON.stringify({ status: "completed", result: "unserializable" });
  }
}

function verifiedProjectState(projectState = {}, parsed = {}) {
  const previous = object(projectState);
  const objective = text(previous.objective);
  const status = text(previous.status).toLowerCase();
  const update = object(parsed.goal_update);

  if (
    !objective ||
    update.applies !== true ||
    status === "completed" ||
    status === "cancelled"
  ) {
    return previous;
  }

  const completedStep = text(update.completed_step).slice(0, 500);
  const previousSteps = list(previous.completed_steps)
    .map((item) => text(item).slice(0, 500))
    .filter(Boolean);
  const normalizedCompletedStep = completedStep.toLowerCase();
  const alreadyRecorded = normalizedCompletedStep && previousSteps.some(
    (item) => item.toLowerCase() === normalizedCompletedStep,
  );
  const completedSteps = completedStep && !alreadyRecorded
    ? [...previousSteps.slice(-9), completedStep]
    : previousSteps.slice(-10);

  const progressSummary = text(update.progress_summary).slice(0, 1200);
  const nextStep = hasOwn(update, "next_step")
    ? text(update.next_step).slice(0, 600) || null
    : previous.next_step ?? null;

  return {
    ...previous,
    completed_steps: completedSteps,
    progress_summary:
      progressSummary || text(previous.progress_summary).slice(0, 1200) || null,
    next_step: nextStep,
  };
}

export async function verifyOperatorExecution({
  organizationId,
  partyId,
  entityId = null,
  locale = null,
  timezone = null,
  originalMessage,
  source = "text",
  currentScreen = null,
  agreementState = {},
  projectState = {},
  conversation = [],
  capability,
  result,
} = {}) {
  if (!organizationId) throw new Error("OPERATOR_ORGANIZATION_REQUIRED");
  if (!partyId) throw new Error("OPERATOR_PARTY_REQUIRED");

  const voice = text(source).toLowerCase() === "voice";
  const evidence = evidenceJson(result);
  const prompt = `
You are Avantiqo. A registered business capability has already completed successfully.

Turn the verified execution evidence into the final user-facing answer, and determine whether this completed action materially advances the active project goal.
Do not plan or invoke another capability. Do not invent facts.
Answer the user's original request naturally in the same language as the user unless they explicitly requested another language.
State only what the evidence supports. If the result is a list, summarize the useful facts rather than dumping raw JSON.
Do not mention internal routing, capabilities, models, prompts, JSON, or implementation details.
${voice ? "Keep the answer concise and natural for spoken conversation." : "Keep the answer clear and concise."}

Goal continuity rules:
- current_project_state is durable working memory, not permission to invent progress.
- Set goal_update.applies to true only when this completed action materially advances current_project_state.objective.
- If applies is true, completed_step must be one concise factual description of the step that actually completed.
- If applies is true, progress_summary should describe the goal's new factual working position after this result.
- If the completed action fulfilled the recorded next step, set next_step to the best safe next step supported by the goal and evidence. If no clear next step is supported, return null rather than repeating the completed step.
- If the action is unrelated to the active goal, set applies to false and leave all goal_update fields null.
- Never add or change decisions here. Never declare the overall goal completed here. Goal completion still requires the user's explicit confirmation.

User's original request:
${text(originalMessage)}

Current project state:
${JSON.stringify(object(projectState)).slice(0, 6000)}

Completed action:
${text(capability?.key) || "registered business action"}

Verified execution evidence:
${evidence}

Return exactly one JSON object:
{
  "response_text":"final answer for the user",
  "goal_update":{
    "applies":false,
    "completed_step":null,
    "progress_summary":null,
    "next_step":null
  }
}
`.trim();

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    service_id: "ai.text.generate",
    input: {
      prompt,
      max_output_tokens: voice ? 240 : 380,
      response_format: {
        type: "json_object",
      },
    },
    metadata: {
      module: "OPERATOR",
      operation: "VERIFY_EXECUTION",
      channel: text(source) || "text",
      latency_class: voice ? "realtime" : "interactive",
      capability_key: text(capability?.key) || null,
      goal_continuity: true,
    },
    category: "AI",
  });

  const rawText = findText(execution);
  const parsed = parseJson(rawText);
  const responseText = text(parsed?.response_text) || rawText;
  if (!responseText) {
    throw new Error("OPERATOR_VERIFICATION_EMPTY_RESPONSE");
  }

  return {
    decision: {
      response_text: responseText.slice(0, voice ? 1200 : 4000),
      response_language: text(locale) || null,
      intent: "answer",
      confidence: 1,
      agreement_state: object(agreementState),
      project_state: verifiedProjectState(projectState, parsed || {}),
      clarification: {
        required: false,
        question: null,
        options: [],
      },
      navigation: {
        target_id: null,
      },
      execution: {
        capability_key: null,
        payload: {},
        reason: null,
      },
      plan: [],
    },
    agreement_state: object(agreementState),
    current_screen: currentScreen || null,
    provider_evidence: {
      provider: execution?.provider || null,
      model: execution?.model || null,
      usage_id: execution?.usage?.id || null,
      pricing_id: execution?.pricing?.pricing_id || null,
    },
  };
}