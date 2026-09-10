function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

const SIMPLE_QUESTION_PATTERN =
  /^(what|who|when|where|why|how|is|are|do|does|did|can|could|would|will)\b/i;
const NEUTRAL_TEXT_COMMAND_PATTERN =
  /^(state|explain|describe|define|summari[sz]e|condense|translate|rephrase|paraphrase|tell me|give me)\b/i;
const MUTATING_ACTION_PATTERN =
  /\b(create|draft|write|send|post|publish|delete|remove|update|change|pay|refund|approve|reject|execute|fix|repair|manage|schedule|book|cancel|mark|move|assign|add|deploy|release|merge)\b/i;
const BUSINESS_READ_PATTERN =
  /\b(show|list|check|find|latest|current|status|balance|invoice|customer|supplier|employee|payroll|finance|revenue|expense|sales|stock|inventory|project|campaign|studio|asset|report|dashboard|system|workspace|attendance|schedule|booking|arrival|bank|trial)\b/i;
const PROJECT_CONTROL_PATTERN =
  /^(next|next step|continue|resume|carry on|keep going|go on|what(?:'s| is) next|what(?:'s| is) the next step|what should happen next|what do we need to do next)\s*[?.!]*$/i;
const STATEFUL_AGREEMENT_KEYS = new Set([
  "pending_execution",
  "autonomous_run",
  "recommended_action",
  "operator_recommendation",
  "recommendation",
  "recommendation_refinement",
  "recommendation_refinement_preparation",
]);

function hasStatefulAgreement(agreementState = {}) {
  if (!agreementState || typeof agreementState !== "object" || Array.isArray(agreementState)) {
    return false;
  }
  return Object.keys(agreementState).some((key) => STATEFUL_AGREEMENT_KEYS.has(key));
}

export function shouldUseOwnedFastFirst({
  source = "text",
  message = "",
  deepRequired = false,
  agreementState = {},
} = {}) {
  const channel = text(source, 40).toLowerCase() || "text";
  const input = text(message);

  if (channel !== "text") return false;
  if (!input || input.length > 160) return false;
  if (deepRequired === true) return false;
  if (hasStatefulAgreement(agreementState)) return false;
  if (PROJECT_CONTROL_PATTERN.test(input)) return false;
  if (MUTATING_ACTION_PATTERN.test(input)) return false;
  if (BUSINESS_READ_PATTERN.test(input)) return true;

  return (
    SIMPLE_QUESTION_PATTERN.test(input) ||
    NEUTRAL_TEXT_COMMAND_PATTERN.test(input)
  );
}

export const OperatorFastFirstPolicy = Object.freeze({
  shouldUseFastFirst: shouldUseOwnedFastFirst,
});