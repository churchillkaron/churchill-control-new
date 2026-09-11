const DATA_OR_HUMAN = new Map([
  ["CONTACT_CALLS_DISABLED", "Confirm whether calls may be enabled for this contact, or choose an already-authorized message channel."],
  ["CONTACT_MESSAGES_DISABLED", "Confirm whether messages may be enabled for this contact, or choose an already-authorized call channel."],
  ["CONTACT_DO_NOT_DISTURB", "Confirm whether this follow-up should remain blocked by the contact's do-not-disturb preference."],
  ["FOLLOW_UP_CONTENT_NOT_SELF_CONTAINED", "Provide the missing fact, document, decision, or instruction required to make the follow-up truthful."],
  ["SECRETARY_FOLLOW_UP_CONTACT_REQUIRED_FOR_CALL", "Select the canonical contact for this follow-up."],
  ["SECRETARY_FOLLOW_UP_CONTACT_PHONE_REQUIRED", "Provide or confirm the contact's usable phone number."],
  ["SECRETARY_COVERAGE_ROUTING_REVIEW_REQUIRED", "Resolve the ambiguous Secretary coverage owner before any external action proceeds."],
]);

const CONFIGURATION_OR_EXTERNAL = new Set([
  "SAFE_COMMUNICATION_CHANNEL_UNAVAILABLE",
  "SECRETARY_FOLLOW_UP_PHONE_LINE_UNAVAILABLE",
]);

const TRANSIENT_OR_REINSPECT = new Set([
  "OUTBOUND_CALL_FAILED",
  "OUTBOUND_CALL_CANCELLED",
  "AMBIGUOUS_DELIVERY_SENDING",
  "AMBIGUOUS_DELIVERY_FAILED",
  "MESSAGE_NOT_SENT",
]);

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function rootReason(value) {
  return text(value, 2000).toUpperCase().split(":")[0];
}

export function secretaryFollowUpRecoveryDirective({ reason, execution = {}, followUp = {} } = {}) {
  const root = rootReason(reason);
  const humanQuestion = DATA_OR_HUMAN.get(root);
  if (humanQuestion) {
    return {
      contract: "AVANTIQO_SECRETARY_FOLLOW_UP_RECOVERY_V1",
      status: "RECOVERY_REQUIRED",
      recovery_classification: "DATA_OR_CLARIFICATION",
      recovery_owner: "BUSINESS_PARTNER",
      next_path: "ASK_ONLY_REQUIRED_HUMAN_TRUTH",
      needs_human_truth: true,
      question: humanQuestion,
      retry_policy: "resume_after_required_truth",
      external_wait: null,
      authorization_effect: "NONE",
      manual_takeover_required: false,
    };
  }

  if (CONFIGURATION_OR_EXTERNAL.has(root)) {
    return {
      contract: "AVANTIQO_SECRETARY_FOLLOW_UP_RECOVERY_V1",
      status: "DEPENDENCY_RECOVERY_REQUIRED",
      recovery_classification: "CONFIGURATION_OR_EXTERNAL",
      recovery_owner: "BUSINESS_PARTNER",
      next_path: "RESOLVE_CONFIGURATION_OR_EXTERNAL_DEPENDENCY",
      needs_human_truth: false,
      question: null,
      retry_policy: "resume_after_dependency_verified",
      external_wait: null,
      authorization_effect: "NONE",
      manual_takeover_required: false,
    };
  }

  if (TRANSIENT_OR_REINSPECT.has(root)) {
    return {
      contract: "AVANTIQO_SECRETARY_FOLLOW_UP_RECOVERY_V1",
      status: "REINSPECTION_REQUIRED",
      recovery_classification: "TRANSIENT_RUNTIME",
      recovery_owner: "BUSINESS_PARTNER",
      next_path: "SAFE_REINSPECT_THEN_RETRY",
      needs_human_truth: false,
      question: null,
      retry_policy: "safe_reinspect_then_retry",
      external_wait: null,
      authorization_effect: "NONE",
      manual_takeover_required: false,
    };
  }

  return {
    contract: "AVANTIQO_SECRETARY_FOLLOW_UP_RECOVERY_V1",
    status: "DIAGNOSIS_REQUIRED",
    recovery_classification: "DIAGNOSIS_REQUIRED",
    recovery_owner: "BUSINESS_PARTNER",
    next_path: "READ_CURRENT_STATE_AND_CLASSIFY",
    needs_human_truth: false,
    question: null,
    retry_policy: "no_retry_before_diagnosis",
    external_wait: null,
    authorization_effect: "NONE",
    manual_takeover_required: false,
  };
}

export function secretaryRecoveryMessage(directive = {}, action = "follow-up") {
  const path = text(directive?.next_path, 120);
  if (path === "ASK_ONLY_REQUIRED_HUMAN_TRUTH") return `Avantiqo paused this ${action} because one human-owned fact or preference is required. Once confirmed, Business Partner can continue the same follow-up.`;
  if (path === "RESOLVE_CONFIGURATION_OR_EXTERNAL_DEPENDENCY") return `Avantiqo paused this ${action} because the required communication configuration or transport is unavailable. Business Partner retains the job, will inspect the dependency, and can resume the same follow-up once the dependency is verified.`;
  if (path === "SAFE_REINSPECT_THEN_RETRY") return `Avantiqo paused this ${action} after a transport or delivery failure. Business Partner should re-inspect current delivery state before any safe retry.`;
  return `Avantiqo paused this ${action} for current-state diagnosis. Business Partner retains ownership of the next recovery step.`;
}
