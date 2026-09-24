export const CODE_AI_VERIFIER_IDENTITY_CONTRACT =
  "AVANTIQO_CODE_AI_VERIFIER_IDENTITY_V1";

const SAFE_ENV_KEYS = new Set(["AVANTIQO_NEXT_DIST_DIR"]);

function text(value, maximum = 2000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeCodeAIVerifierEnvironment(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => SAFE_ENV_KEYS.has(key))
      .map(([key, candidate]) => [key, text(candidate, 500)])
      .filter(([, candidate]) => candidate.length > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function normalizeCodeAIVerifierIdentity(entry = {}) {
  const command = text(entry?.command, 300);
  if (!command) return null;
  return {
    command,
    normalized_command: command.toLowerCase(),
    args: list(entry?.args).slice(0, 40).map((item) => text(item, 1200)),
    env: normalizeCodeAIVerifierEnvironment(entry?.env),
  };
}

export function codeAIVerifierKey(entry = {}) {
  const normalized = normalizeCodeAIVerifierIdentity(entry);
  if (!normalized) return null;
  return JSON.stringify({
    command: normalized.normalized_command,
    args: normalized.args,
    env: normalized.env,
  });
}

export function codeAIVerifierDisplay(entry = {}) {
  const normalized = normalizeCodeAIVerifierIdentity(entry);
  if (!normalized) return "";
  const envPrefix = Object.entries(normalized.env)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  return [envPrefix, normalized.command, ...normalized.args].filter(Boolean).join(" ");
}

export default Object.freeze({
  contract: CODE_AI_VERIFIER_IDENTITY_CONTRACT,
  normalize: normalizeCodeAIVerifierIdentity,
  normalizeEnvironment: normalizeCodeAIVerifierEnvironment,
  key: codeAIVerifierKey,
  display: codeAIVerifierDisplay,
  safe_environment_keys: [...SAFE_ENV_KEYS],
});
