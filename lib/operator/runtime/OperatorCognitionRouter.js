import {
  rankOperatorCapabilities,
} from "./OperatorCapabilityMatcher.js";

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

function fastCollaborativeDiscussion(value) {
  const utterance = normalizedUtterance(value);
  if (!utterance || utterance.length > 240) return false;

  const collaborativePatterns = [
    /\bwhat do you think\b/,
    /\bwhat would you do\b/,
    /\bwhat should (?:we|i) do\b/,
    /\bdo you recommend\b/,
    /\byour recommendation\b/,
    /\bgive me (?:some |\d+ |one |two |three |four |five )?(?:better )?ideas?\b/,
    /\bany (?:better |other )?ideas?\b/,
    /\bwhat if\b/,
    /\bcould we\b/,
    /\bhow about\b/,
    /\blet'?s try\b/,
    /\bmake it (?:better|stronger|slower|faster|darker|more emotional|more cinematic|more mysterious)\b/,
    /\bdiscuss\b/,
  ];

  if (!collaborativePatterns.some((pattern) => pattern.test(utterance))) return false;
  if (/\b(root cause|deep analysis|analy[sz]e deeply|full analysis|architecture review|investigate deeply)\b/.test(utterance)) return false;
  return true;
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

  const explicitDeep = /\b(think deeply|deep analysis|analy[sz]e deeply|full analysis|architecture review|root cause analysis|investigate deeply|complex tradeoff analysis|autonomous engineering)\b/i.test(clean);
  if (explicitDeep) return { path: "deep", reason: "EXPLICIT_DEEP_REQUEST" };

  if (hasHighConsequenceLanguage(clean) && hasMaterialUncertainty(clean)) {
    return { path: "deep", reason: "MATERIAL_UNCERTAINTY" };
  }

  if (fastCollaborativeDiscussion(clean)) {
    return { path: "fast", reason: "FAST_COLLABORATIVE_PARTNER_TURN" };
  }

  // Length alone is not a reason to buy Deep cognition. Longer discussion,
  // strategy and follow-up reasoning should stay on the owned local server
  // unless another concrete ambiguity or consequence signal requires Deep.
  if (needsDeliberation(clean)) {
    return { path: "fast", reason: "FAST_LOCAL_DELIBERATION" };
  }

  const ranked = rankOperatorCapabilities({
    message: clean,
    capabilities,
    limit: 8,
  });
  const material = ranked.filter(isMaterial);
  const actions = material.filter(isAction);
  const strongActions = actions.filter((entry) =>
    Number(entry?.score || 0) >= 0.3 ||
    Number(entry?.phrase_affinity || 0) >= 0.7 ||
    Number(entry?.primary_coverage || 0) >= 0.6
  );
  const topAction = actions[0] || null;
  const secondAction = actions[1] || null;
  const actionSeparation = topAction
    ? Number(topAction.score || 0) - Number(secondAction?.score || 0)
    : 0;
  const dominantAction = Boolean(
    topAction &&
    (
      Number(topAction.phrase_affinity || 0) >= 0.86 ||
      Number(topAction.primary_coverage || 0) >= 0.82 ||
      (Number(topAction.score || 0) >= 0.42 && actionSeparation >= 0.1)
    )
  );

  // Clear registered commands stay cheap even when nearby catalog actions also
  // score weakly. The Fast lane only selects/stages the exact capability; the
  // normal permission, confirmation, approval, transaction and verification
  // boundaries still control execution. Deep is reserved for real ambiguity.
  if ((strongActions.length === 1 && actions.length === 1) || dominantAction) {
    return { path: "fast", reason: dominantAction ? "DOMINANT_REGISTERED_ACTION" : "REGISTERED_ROUTINE_ACTION" };
  }

  if (actions.length > 1) {
    return { path: "deep", reason: "MULTI_REGISTERED_ACTION" };
  }

  if (isConsequentialImperative(clean)) {
    return { path: "deep", reason: "CONSEQUENTIAL_IMPERATIVE_UNRESOLVED" };
  }

  // Voice reasoning is deliberate single pass: never a fast model call followed serially by a deep fallback call.
  if (mode(source) === "voice") {
    return { path: "deep", reason: "VOICE_REASONING_SINGLE_PASS" };
  }

  return {
    path: "fast",
    reason: "FAST_EXECUTIVE_TURN",
  };
}

export default routeOperatorCognition;
