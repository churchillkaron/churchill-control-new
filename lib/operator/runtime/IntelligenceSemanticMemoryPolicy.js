const MAX_TEXT = 12000;
const MAX_FEATURES = 160;

function text(value, limit = MAX_TEXT) {
  return String(value ?? "").trim().slice(0, limit);
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s_-]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by",
  "do", "does", "for", "from", "had", "has", "have", "i", "if", "in",
  "is", "it", "me", "my", "of", "on", "or", "our", "please", "that",
  "the", "this", "to", "we", "what", "when", "where", "which", "with",
  "you", "your", "och", "att", "det", "den", "jag", "du", "vi", "ar",
  "pa", "med", "som", "for", "om", "en", "ett", "min", "mitt", "vara",
]);

const CONCEPT_ALIASES = Object.freeze({
  continue: [
    "continue", "resume", "next", "carry on", "keep going", "go on",
    "pick up", "where we left off", "fortsatt", "nasta", "var var vi",
  ],
  deploy: [
    "deploy", "deployment", "release", "production", "prod", "go live",
    "publish", "ship", "rollout", "roll out", "lansera", "produktion",
  ],
  repository: [
    "github", "git", "repository", "repo", "branch", "main", "commit",
    "merge", "pull request", "pr",
  ],
  verify: [
    "verify", "verification", "check", "validate", "validation", "test",
    "smoke test", "confirm result", "prove", "recheck", "kontrollera",
    "verifiera", "testa",
  ],
  execute: [
    "execute", "execution", "run", "perform", "apply", "do it", "fix",
    "change", "update", "write", "execute it", "kor", "utfor", "fixa",
  ],
  plan: [
    "plan", "planning", "strategy", "approach", "roadmap", "next step",
    "best way", "recommend", "prioritize", "prioritise", "strategi", "planera",
  ],
  approval: [
    "approval", "approve", "confirmation", "confirm", "permission", "consent",
    "authorize", "authorization", "godkann", "bekrafta", "tillstand",
  ],
  failure: [
    "fail", "failed", "failure", "error", "problem", "issue", "broken",
    "blocker", "blocked", "bug", "wrong", "misslyck", "fel", "problem",
  ],
  memory: [
    "memory", "remember", "recall", "context", "continuity", "history",
    "previous", "earlier", "last time", "minne", "kom ihag", "tidigare",
  ],
  concise: [
    "concise", "short", "brief", "direct", "minimal", "straight to the point",
    "kort", "koncis", "direkt",
  ],
  invoice: [
    "invoice", "bill", "billing", "customer invoice", "supplier invoice",
    "vendor bill", "faktura", "fakturering",
  ],
  payment: [
    "payment", "pay", "paid", "charge", "settlement", "wallet", "balance",
    "credit", "debit", "betalning", "betala", "saldo",
  ],
  customer: [
    "customer", "client", "buyer", "account", "kund", "klient",
  ],
  supplier: [
    "supplier", "vendor", "provider", "seller", "leverantor",
  ],
  current: [
    "current", "now", "today", "latest", "live", "right now", "present",
    "nu", "idag", "senaste", "aktuell",
  ],
});

function simpleStem(token) {
  let value = token;
  if (value.length <= 4 || /[\u0e00-\u0e7f]/.test(value)) return value;

  for (const suffix of [
    "ization", "isation", "ments", "ment", "ness", "ingly", "edly",
    "ation", "ings", "ing", "ers", "er", "ies", "ied", "ed", "es", "s",
  ]) {
    if (value.length - suffix.length >= 4 && value.endsWith(suffix)) {
      value = value.slice(0, -suffix.length);
      break;
    }
  }
  return value;
}

function rawTokens(value) {
  return normalized(value)
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function ngrams(tokens, size) {
  const output = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    output.push(tokens.slice(index, index + size).join(" "));
  }
  return output;
}

function detectedConcepts(source) {
  const clean = normalized(source);
  const padded = ` ${clean} `;
  const concepts = [];

  for (const [concept, aliases] of Object.entries(CONCEPT_ALIASES)) {
    if (aliases.some((alias) => {
      const candidate = normalized(alias);
      return candidate && padded.includes(` ${candidate} `);
    })) {
      concepts.push(concept);
    }
  }

  return concepts;
}

function weightedFeatureMap(value) {
  const tokens = rawTokens(value).slice(0, 80);
  const stems = tokens.map(simpleStem);
  const bigrams = ngrams(tokens, 2).slice(0, 60);
  const concepts = detectedConcepts(value);
  const features = new Map();

  function add(key, weight) {
    if (!key || features.size >= MAX_FEATURES) return;
    features.set(key, Math.max(features.get(key) || 0, weight));
  }

  tokens.forEach((token) => add(`t:${token}`, 1));
  stems.forEach((stem) => add(`s:${stem}`, 0.82));
  bigrams.forEach((phrase) => add(`b:${phrase}`, 1.18));
  concepts.forEach((concept) => add(`c:${concept}`, 1.45));

  return features;
}

function cosine(left, right) {
  if (!left.size || !right.size) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const [key, value] of left.entries()) {
    leftNorm += value * value;
    if (right.has(key)) dot += value * right.get(key);
  }
  for (const value of right.values()) rightNorm += value * value;

  if (!leftNorm || !rightNorm) return 0;
  return clamp01(dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)));
}

function conceptOverlap(leftText, rightText) {
  const left = new Set(detectedConcepts(leftText));
  const right = new Set(detectedConcepts(rightText));
  if (!left.size || !right.size) return 0;

  let shared = 0;
  for (const concept of left) {
    if (right.has(concept)) shared += 1;
  }
  return clamp01(shared / Math.min(left.size, right.size));
}

function exactPhraseBoost(query, candidate) {
  const left = normalized(query);
  const right = normalized(candidate);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length >= 10 && right.includes(left)) return 0.9;
  if (right.length >= 10 && left.includes(right)) return 0.85;
  return 0;
}

export function semanticMemorySimilarity({
  query,
  subject = "",
  content = "",
  vectorScore = null,
} = {}) {
  const candidate = [subject, content].filter(Boolean).join(" ");
  if (!text(query) || !text(candidate)) {
    return {
      score: 0,
      sparse_score: 0,
      concept_score: 0,
      phrase_score: 0,
      vector_score: vectorScore == null ? null : clamp01(vectorScore),
      mode: vectorScore == null ? "deterministic_sparse" : "hybrid_vector",
    };
  }

  const sparse = cosine(weightedFeatureMap(query), weightedFeatureMap(candidate));
  const concepts = conceptOverlap(query, candidate);
  const phrase = exactPhraseBoost(query, candidate);
  const vector = vectorScore == null ? null : clamp01(vectorScore);

  const deterministic = clamp01(
    sparse * 0.62 +
    concepts * 0.28 +
    phrase * 0.10,
  );

  const score = vector == null
    ? deterministic
    : clamp01(deterministic * 0.45 + vector * 0.55);

  return {
    score,
    sparse_score: sparse,
    concept_score: concepts,
    phrase_score: phrase,
    vector_score: vector,
    mode: vector == null ? "deterministic_sparse" : "hybrid_vector",
  };
}

export function semanticMemoryRelevance(row = {}, query = "", options = {}) {
  return semanticMemorySimilarity({
    query,
    subject: row?.subject || "",
    content: row?.content || "",
    vectorScore: options.vectorScore ?? null,
  });
}

export const INTELLIGENCE_MEMORY_CONCEPT_ALIASES = CONCEPT_ALIASES;
