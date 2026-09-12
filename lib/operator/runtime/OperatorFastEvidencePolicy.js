import { externalResearchRequested } from "./OperatorResearchRoutingPolicy.js";

function text(value) {
  return String(value ?? "").trim();
}

const SELF_CAPABILITY_QUESTION_PATTERN = /\b(what can you do(?: now)?|how can you help(?: me)?|what are your capabilities|what can avantiqo do(?: now)?|what can business partner do(?: now)?|how is code|how smart is code|what can code do(?: now)?)\b/i;

const CURRENT_OR_EXTERNAL_FACT_PATTERN = /\b(current|currently|latest|today|recent|newest|now|price|pricing|rate|exchange rate|weather|news|market|competitor|law|legal|regulation|legislation|standard|release|version|availability|opening hours|address|located|location|where is|who is|when is|invoice|customer|supplier|employee|attendance|schedule|booking|arrival|bank balance|trial balance|cash position|stock|inventory|studio|asset|production|preview|pdf|receipt|image|video|audio|document|file)\b/i;

export function fastConversationNeedsEvidence(message) {
  const input = text(message);
  if (!input) return false;
  if (SELF_CAPABILITY_QUESTION_PATTERN.test(input)) return false;
  return externalResearchRequested(input) || CURRENT_OR_EXTERNAL_FACT_PATTERN.test(input);
}

export const OperatorFastEvidencePolicy = Object.freeze({
  needsEvidence: fastConversationNeedsEvidence,
});

export default fastConversationNeedsEvidence;
