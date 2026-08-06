const FORBIDDEN_EXACT_KEYS = new Set([
  "prompt",
  "prompts",
  "prompt_text",
  "prompt_template",
]);

function text(value) {
  return String(value ?? "").trim();
}

function normalizedKey(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .toLowerCase();
}

export function isPersistedPromptKey(key) {
  const normalized = normalizedKey(key);
  return FORBIDDEN_EXACT_KEYS.has(normalized) ||
    normalized.endsWith("_prompt") ||
    normalized.endsWith("_prompts") ||
    normalized.includes("prompt_template") ||
    normalized.includes("prompt_text");
}

export function stripPersistedPromptFields(value, depth = 0) {
  if (depth > 64) throw new Error("CREATIVE_PROMPTLESS_PERSISTENCE_DEPTH_EXCEEDED");
  if (Array.isArray(value)) {
    return value.map((item) => stripPersistedPromptFields(item, depth + 1));
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isPersistedPromptKey(key))
      .map(([key, child]) => [
        key,
        stripPersistedPromptFields(child, depth + 1),
      ]),
  );
}

export function persistedPromptFieldPaths(
  value,
  current = "root",
  output = [],
  depth = 0,
) {
  if (depth > 64) throw new Error("CREATIVE_PROMPTLESS_AUDIT_DEPTH_EXCEEDED");
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      persistedPromptFieldPaths(
        item,
        `${current}.${index}`,
        output,
        depth + 1,
      ),
    );
    return output;
  }
  if (!value || typeof value !== "object") return output;

  for (const [key, child] of Object.entries(value)) {
    const next = `${current}.${key}`;
    if (isPersistedPromptKey(key)) output.push(next);
    persistedPromptFieldPaths(child, next, output, depth + 1);
  }
  return output;
}

export function assertPromptlessPersistence(value, label = "CREATIVE_PAYLOAD") {
  const paths = persistedPromptFieldPaths(value, label.toLowerCase());
  if (paths.length) {
    throw new Error(
      `${label}_PERSISTED_PROMPT_FIELDS_FORBIDDEN:${paths.join(",")}`,
    );
  }
  return value;
}

export function preparePromptlessPersistence(value, label = "CREATIVE_PAYLOAD") {
  const sanitized = stripPersistedPromptFields(value);
  assertPromptlessPersistence(sanitized, label);
  return sanitized;
}

export const CreativePromptlessPersistenceRuntime = Object.freeze({
  contract: "CREATIVE_PROMPTLESS_PERSISTENCE_V1",
  provider_instruction_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
  isPersistedPromptKey,
  strip: stripPersistedPromptFields,
  paths: persistedPromptFieldPaths,
  assert: assertPromptlessPersistence,
  prepare: preparePromptlessPersistence,
});
