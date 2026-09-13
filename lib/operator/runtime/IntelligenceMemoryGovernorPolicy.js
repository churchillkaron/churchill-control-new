const DEFAULT_MEMORY_LIMITS = Object.freeze({
  maxItems: 12,
  maxTokens: 2400,
  maxBytes: 12000,
  maxItemTokens: 420,
});

const DEFAULT_TURN_LIMITS = Object.freeze({
  maxItems: 12,
  maxTokens: 3200,
  maxBytes: 16000,
  maxItemTokens: 650,
});

function text(value) {
  return String(value ?? "").trim();
}

export function estimateContextTokens(value) {
  const bytes = Buffer.byteLength(text(value), "utf8");
  return Math.ceil(bytes / 3);
}

function truncateText(value, maxTokens, maxBytes) {
  const source = text(value);
  if (!source) return "";
  const byteBudget = Math.max(1, Math.min(
    Number(maxBytes) || Number.MAX_SAFE_INTEGER,
    (Number(maxTokens) || Number.MAX_SAFE_INTEGER) * 3,
  ));
  if (Buffer.byteLength(source, "utf8") <= byteBudget) return source;

  const characters = Array.from(source);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = characters.slice(0, middle).join("");
    if (Buffer.byteLength(candidate, "utf8") <= byteBudget) low = middle;
    else high = middle - 1;
  }
  return characters.slice(0, low).join("").trim();
}

function normalizedLimits(defaults, overrides = {}) {
  return {
    maxItems: Math.max(1, Number(overrides.maxItems) || defaults.maxItems),
    maxTokens: Math.max(1, Number(overrides.maxTokens) || defaults.maxTokens),
    maxBytes: Math.max(256, Number(overrides.maxBytes) || defaults.maxBytes),
    maxItemTokens: Math.max(32, Number(overrides.maxItemTokens) || defaults.maxItemTokens),
  };
}
export function boundRecentConversationTurns(rows = [], overrides = {}) {
  const limits = normalizedLimits(DEFAULT_TURN_LIMITS, overrides);
  const selected = [];
  let usedBytes = 0;
  let usedTokens = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    if (selected.length >= limits.maxItems) break;
    const content = truncateText(row?.content, limits.maxItemTokens, limits.maxBytes);
    if (!content) continue;
    const bytes = Buffer.byteLength(content, "utf8");
    const tokens = estimateContextTokens(content);
    if (usedBytes + bytes > limits.maxBytes || usedTokens + tokens > limits.maxTokens) break;
    selected.push({ role: row?.role === "assistant" ? "assistant" : "user", content });
    usedBytes += bytes;
    usedTokens += tokens;
  }

  return selected.reverse();
}

export function boundLongTermMemoryContext(memories = [], overrides = {}) {
  const limits = normalizedLimits(DEFAULT_MEMORY_LIMITS, overrides);
  const selected = [];
  let usedBytes = 0;
  let usedTokens = 0;
  for (const memory of Array.isArray(memories) ? memories : []) {
    if (selected.length >= limits.maxItems) break;
    const content = truncateText(memory?.content, limits.maxItemTokens, limits.maxBytes);
    if (!content) continue;
    const bytes = Buffer.byteLength(content, "utf8");
    const tokens = estimateContextTokens(content);
    if (usedBytes + bytes > limits.maxBytes || usedTokens + tokens > limits.maxTokens) break;
    selected.push({ ...memory, content });
    usedBytes += bytes;
    usedTokens += tokens;
  }

  return selected;
}

export const IntelligenceMemoryGovernorPolicy = Object.freeze({
  memoryLimits: DEFAULT_MEMORY_LIMITS,
  turnLimits: DEFAULT_TURN_LIMITS,
  estimateTokens: estimateContextTokens,
  boundTurns: boundRecentConversationTurns,
  boundMemory: boundLongTermMemoryContext,
});
