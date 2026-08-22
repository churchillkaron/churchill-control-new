function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

const DELIBERATIVE_PATTERN = /\b(think|plan|planning|strategy|strategic|analy[sz]e|analysis|compare|comparison|decide|decision|recommend|recommendation|best way|tradeoff|trade off|pros and cons|challenge|root cause|why|fix|repair|debug|investigate|autonomous|architecture|risk|problem|issue|what should|how should|how can we|which option|what do you think|what would you do)\b/i;
const LONG_COMPLEX_PATTERN = /\b(goal|constraint|decision|step|plan|strategy|option|risk|issue|problem|repair|debug|architecture|workflow|mission|autonomous|implement|build|change|fix|compare|recommend|reason|investigate)\b/i;

export function needsOwnedCognitiveBrief({ source = "text", message = "" } = {}) {
  if (text(source, 40).toLowerCase() === "voice") return false;

  const input = text(message);
  if (!input) return false;
  if (DELIBERATIVE_PATTERN.test(input)) return true;

  return input.length > 420 && LONG_COMPLEX_PATTERN.test(input);
}

export const OperatorOwnedCognitiveBriefPolicy = Object.freeze({
  needsBrief: needsOwnedCognitiveBrief,
});
