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
    /^is that (?:really )?(?:best|right|correct)\??$/,
    /^is this (?:really )?(?:best|right|correct)\??$/,
    /^explain(?: that| this)?\??$/,
    /^tell me more\??$/,
    /^challenge (?:that|this)\??$/,
  ];

  return strategicFollowUpPatterns.some((pattern) => pattern.test(utterance));
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
