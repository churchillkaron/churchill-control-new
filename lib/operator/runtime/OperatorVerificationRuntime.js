import {
  reasonAboutOperatorTurn,
} from "./OperatorReasoningRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function evidenceJson(value) {
  try {
    return JSON.stringify(value).slice(0, 18000);
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
