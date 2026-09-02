function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

// Deep cognition is an explicit scarce lane. Ordinary conversational words such
// as "why", "fix", "issue" or "recommendation" must not make a short turn pay
// the cold-start and multi-phase Deep cost by themselves.
const EXPLICIT_DEEP_PATTERN = /\b(think deeply|deep analysis|analy[sz]e deeply|full analysis|strategy|strategic|architecture|root cause|investigate|autonomous|tradeoff|trade off|pros and cons|compare|comparison|decide|decision|what should|how should|which option|what would you do)\b/i;
const LIGHT_REASONING_PATTERN = /\b(why|fix|repair|solve|solved|debug|problem|issue|recommend|recommendation|best way|challenge|risk|what do you think|how can we)\b/i;
const LONG_COMPLEX_PATTERN = /\b(goal|constraint|decision|step|plan|strategy|option|risk|issue|problem|repair|solve|solved|debug|architecture|workflow|mission|autonomous|implement|build|change|fix|compare|recommend|reason|investigate)\b/i;

export function needsOwnedCognitiveBrief({ source = "text", message = "" } = {}) {
  if (text(source, 40).toLowerCase() === "voice") return false;

  const input = text(message);
  if (!input) return false;

  // Explicit requests for deep/strategic reasoning remain on the owned Deep lane.
  if (EXPLICIT_DEEP_PATTERN.test(input)) return true;

  // Long multi-factor work still receives a governed cognitive brief.
  if (input.length > 420 && LONG_COMPLEX_PATTERN.test(input)) return true;

  // Mid-sized reasoning turns need both a reasoning signal and a complexity
  // signal. Short conversational questions stay on Fast by default.
  return input.length > 260 &&
    LIGHT_REASONING_PATTERN.test(input) &&
    LONG_COMPLEX_PATTERN.test(input);
}

export const OperatorOwnedCognitiveBriefPolicy = Object.freeze({
  needsBrief: needsOwnedCognitiveBrief,
});
