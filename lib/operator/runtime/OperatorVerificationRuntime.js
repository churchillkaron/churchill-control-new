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

Your only job is to turn the verified execution evidence into the final user-facing answer.
Do not plan another action, do not request or invoke another capability, and do not invent facts.
Answer the user's original request naturally in the same language as the user unless they explicitly requested another language.
State only what the evidence supports. If the result is a list, summarize the useful facts rather than dumping raw JSON.
Do not mention internal routing, capabilities, models, prompts, JSON, or implementation details.
${voice ? "Keep the answer concise and natural for spoken conversation." : "Keep the answer clear and concise."}

User's original request:
${text(originalMessage)}

Completed action:
${text(capability?.key) || "registered business action"}

Verified execution evidence:
${evidence}

Reply only with the final answer for the user.
`.trim();

  const execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    service_id: "ai.text.generate",
    input: {
      prompt,
      max_output_tokens: voice ? 180 : 300,
    },
    metadata: {
      module: "OPERATOR",
      operation: "VERIFY_EXECUTION",
      channel: text(source) || "text",
      latency_class: voice ? "realtime" : "interactive",
      capability_key: text(capability?.key) || null,
    },
    category: "AI",
  });

  const responseText = findText(execution);
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
      project_state: object(projectState),
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
