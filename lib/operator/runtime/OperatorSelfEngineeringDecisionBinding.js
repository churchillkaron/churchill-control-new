export const OPERATOR_SELF_ENGINEERING_DECISION_BINDING_CONTRACT =
  "AVANTIQO_OPERATOR_SELF_ENGINEERING_DECISION_BINDING_V1";

const CYCLE_KEY = "platform.product_engineering_cycle.execute";
const PORTFOLIO_KEY = "platform.product_engineering_portfolio.execute";

function text(value, limit = 5000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function supportedCapabilityKey(value) {
  const key = text(value, 300);
  return key === CYCLE_KEY || key === PORTFOLIO_KEY ? key : null;
}
export function bindOperatorSelfEngineeringDecision({
  decision = {},
  selfEngineeringRequest = null,
  capabilities = [],
} = {}) {
  const request = object(selfEngineeringRequest);
  if (request.detected !== true) {
    return { applied: false, decision, reason: "SELF_ENGINEERING_NOT_DETECTED" };
  }

  const capabilityKey = supportedCapabilityKey(request.capability_key);
  if (!capabilityKey) {
    return { applied: false, decision, reason: "SELF_ENGINEERING_CAPABILITY_KEY_INVALID" };
  }

  const registered = list(capabilities).find((item) => item?.key === capabilityKey);
  if (!registered) {
    return { applied: false, decision, reason: "SELF_ENGINEERING_CAPABILITY_NOT_REGISTERED" };
  }
  const originalMessage = text(request.original_message, 5000);
  if (!originalMessage) {
    return { applied: false, decision, reason: "SELF_ENGINEERING_ORIGINAL_MESSAGE_REQUIRED" };
  }

  const current = object(decision);
  const currentExecution = object(current.execution);
  if (
    current.intent === "execute" &&
    text(currentExecution.capability_key, 300) === capabilityKey
  ) {
    return {
      applied: false,
      decision,
      reason: "SELF_ENGINEERING_DECISION_ALREADY_BOUND",
    };
  }

  const payload = capabilityKey === PORTFOLIO_KEY
    ? { business_goal: originalMessage }
    : { focus: originalMessage };
  return {
    applied: true,
    reason: "SERVER_CLASSIFIED_SELF_ENGINEERING_BOUND",
    contract: OPERATOR_SELF_ENGINEERING_DECISION_BINDING_CONTRACT,
    capability_key: capabilityKey,
    decision: {
      ...current,
      intent: "execute",
      response_text: text(current.response_text, 1200) ||
        "I’m sending this through Avantiqo Product Engineering now.",
      clarification: { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: {
        capability_key: capabilityKey,
        payload,
        reason: "Server-classified Avantiqo self-engineering request.",
      },
    },
    authorization_effect: "NONE",
    automatic_commit_allowed: false,
    automatic_deploy_allowed: false,
    automatic_migration_allowed: false,
  };
}
