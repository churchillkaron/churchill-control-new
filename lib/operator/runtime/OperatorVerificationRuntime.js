import {
  reasonAboutOperatorTurn,
} from "./OperatorReasoningRuntime";

function text(value) {
  return String(value ?? "").trim();
}

// This evidence is the input to the second model call of a turn, so its size is
// felt directly as latency. Truncating a large payload to 18000 characters also
// cut lists mid-structure, which let the model report the truncated count as the
// total. Large collections are now summarised to a stated total plus a sample, so
// the call is both faster and unable to misreport how many rows there were.
const EVIDENCE_CHAR_LIMIT = 6000;
const EVIDENCE_SAMPLE_SIZE = 12;

function collectionOf(value) {
  if (Array.isArray(value)) return { rows: value, key: null };

  if (value && typeof value === "object") {
    for (const key of ["rows", "records", "items", "sessions", "orders", "events", "receipts"]) {
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
        collection.key ? { ...value, [collection.key]: undefined, ...summary } : summary,
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
  const verificationMessage = `
The user's original request was:
${text(originalMessage)}

A registered Avantiqo business capability has now completed successfully.
Do not request this capability again. Verify the evidence below and answer the original user naturally in their language. State only what the evidence supports. If the result is a list, summarize the useful facts rather than dumping raw JSON.

Capability: ${capability?.key || "unknown"}
Verified execution evidence:
${evidenceJson(result)}
`;

  const verification = await reasonAboutOperatorTurn({
    organizationId,
    partyId,
    entityId,
    locale,
    timezone,
    message: verificationMessage,
    source,
    currentScreen,
    agreementState,
    projectState,
    conversation,
    navigationTargets: [],
    capabilities: [],
  });

  return {
    ...verification,
    decision: {
      ...verification.decision,
      intent: "answer",
      navigation: { target_id: null },
      execution: {
        capability_key: null,
        payload: {},
        reason: null,
      },
    },
  };
}
