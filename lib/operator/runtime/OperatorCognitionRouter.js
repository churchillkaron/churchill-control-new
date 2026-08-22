import {
  rankOperatorCapabilities,
} from "./OperatorCapabilityMatcher";

function text(value) {
  return String(value ?? "").trim();
}

function mode(value) {
  return text(value).toLowerCase();
}

function normalizedUtterance(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s?_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAction(entry) {
  return !["read", "navigate"].includes(mode(entry?.capability?.mode));
}

function isMaterial(entry) {
  return (
    Number(entry?.score || 0) >= 0.18 ||
    Number(entry?.phrase_affinity || 0) >= 0.55 ||
    Number(entry?.primary_coverage || 0) >= 0.35
  );
}

function needsDeliberation(value) {
  const utterance = normalizedUtterance(value);
  if (!utterance) return false;

  const phrases = [
    "what do you think",
    "what should",
    "what would you",
    "what is the best",
    "whats the best",
    "best way",
    "do you recommend",
    "your recommendation",
    "recommendation",
    "recommend",
    "strategy",
    "strategic",
    "plan this",
    "make a plan",
    "help me plan",
    "think through",
    "reason through",
    "analyze",
    "analyse",
    "compare",
    "tradeoff",
    "trade off",
    "pros and cons",
    "which is better",
    "which one",
    "why should",
    "why would",
    "why is",
    "why does",
    "how should",
    "how would",
    "how can we",
    "how do we",
    "solve this",
    "figure out",
    "idea",
    "ideas",
    "discuss",
    "decision",
    "decide",
    "prioritize",
    "prioritise",
    "risk",
    "opportunity",
    "what could go wrong",
    "are there any issues",
    "is this safe",
    "is it safe",
  ];

  if (phrases.some((phrase) => utterance.includes(phrase))) return true;

  const strategicFollowUpPatterns = [
    /^why\??$/,
    /^why not\??$/,
    /^how so\??$/,
    /^then what\??$/,
    /^and then\??$/,
    /^what next\??$/,
    /^what about(?:\s+.+)?\??$/,
    /^are you sure\??$/,
    /^is that (?:really )?(?:best|right|correct|safe)\??$/,
    /^is this (?:really )?(?:best|right|correct|safe)\??$/,
    /^explain(?: that| this)?\??$/,
    /^tell me more\??$/,
    /^challenge (?:that|this)\??$/,
  ];

  return strategicFollowUpPatterns.some((pattern) => pattern.test(utterance));
}

function isConsequentialImperative(value) {
  const utterance = normalizedUtterance(value);
  if (!utterance) return false;

  const directPatterns = [
    /^(?:please\s+)?(?:do|execute|run|apply|change|update|create|delete|remove|fix|repair|send|publish|post|approve|reject|pay|charge|refund|cancel|merge|deploy|release|ship|invite|archive|close|open)\b/,
    /^(?:please\s+)?(?:make|set|mark|move|assign|add)\b.+\b(?:live|production|paid|approved|rejected|active|inactive|closed|deleted|published|sent)\b/,
    /^(?:fix|do|run|execute|approve|pay|send|publish|deploy|merge)\s+(?:it|this|that|them)\b/,
    /^(?:g[öo]r|k[öo]r|fixa|skicka|publicera|godk[äa]nn|betala|radera|ta bort|deploya|merga)\b/,
  ];

  return directPatterns.some((pattern) => pattern.test(utterance));
}

function hasHighConsequenceLanguage(value) {
  const utterance = normalizedUtterance(value);
  if (!utterance) return false;

  return /\b(production|prod|go live|deploy|release|publish|send|message|email|whatsapp|sms|pay|payment|refund|charge|approve|approval|reject|delete|remove|merge|contract|invoice|payroll|salary|bank|tax|vat|compliance|permission|role|access|credential|secret|api key|produktion|lansera|publicera|skicka|betala|godkann|radera|lon|skatt|moms|behorighet)\b/.test(utterance);
}

function hasMaterialUncertainty(value) {
  const utterance = normalizedUtterance(value);
  if (!utterance) return false;

  return /\b(maybe|perhaps|not sure|unsure|i think|probably|possibly|might|could be|uncertain|maybe not|kanske|osaker|inte saker|tror att)\b/.test(utterance);
}

export function routeOperatorCognition({
  message,
  source = "text",
  capabilities = [],
} = {}) {
  const clean = text(message).replace(/\s+/g, " ");
  if (!clean) return { path: "fast", reason: "LIGHTWEIGHT_TURN" };
  if (clean.length > 360) return { path: "deep", reason: "COMPLEX_TURN" };
  if (needsDeliberation(clean)) {
    return { path: "deep", reason: "DELIBERATIVE_PARTNER_TURN" };
  }
  if (isConsequentialImperative(clean)) {
    return { path: "deep", reason: "CONSEQUENTIAL_IMPERATIVE" };
  }
  if (hasHighConsequenceLanguage(clean) && hasMaterialUncertainty(clean)) {
    return { path: "deep", reason: "MATERIAL_UNCERTAINTY" };
  }

  const ranked = rankOperatorCapabilities({
    message: clean,
    capabilities,
    limit: 8,
  });
  const material = ranked.filter(isMaterial);
  const actions = material.filter(isAction);

  if (
    actions.some((entry) =>
      entry.capability?.requires_confirmation === true ||
      entry.capability?.transactional === true ||
      ["high", "critical"].includes(mode(entry.capability?.risk)),
    )
  ) {
    return { path: "deep", reason: "REGISTERED_GOVERNED_ACTION" };
  }

  if (actions.length > 1) {
    return { path: "deep", reason: "MULTI_REGISTERED_ACTION" };
  }

  if (actions.length === 1 && Number(actions[0].score || 0) >= 0.3) {
    return { path: "deep", reason: "REGISTERED_ACTION" };
  }

  if (mode(source) === "voice") {
    return { path: "deep", reason: "VOICE_REASONING_SINGLE_PASS" };
  }

  return {
    path: "fast",
    reason: "FAST_EXECUTIVE_TURN",
  };
}

export default routeOperatorCognition;
