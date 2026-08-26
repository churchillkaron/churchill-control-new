import { createHash } from "node:crypto";

export const CODE_AI_GUARDED_ACTION_IDENTITY_CONTRACT =
  "AVANTIQO_CODE_AI_GUARDED_ACTION_IDENTITY_V1";
export const CODE_AI_DEFAULT_SEARCH_MODE = "literal";
export const CODE_AI_SEARCH_MODES = Object.freeze([
  "literal",
  "regex",
  "path",
  "glob",
]);

const SEARCH_MODE_SET = new Set(CODE_AI_SEARCH_MODES);
const DEFAULT_READ_WINDOW = 400;

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function positiveLineNumber(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function uniqueSorted(values, maximum = 1200) {
  return [...new Set(
    list(values)
      .map((item) => text(item, maximum))
      .filter(Boolean),
  )].sort();
}

function normalizedSearchMode(value) {
  const mode = text(value, 40).toLowerCase() || CODE_AI_DEFAULT_SEARCH_MODE;
  return SEARCH_MODE_SET.has(mode) ? mode : CODE_AI_DEFAULT_SEARCH_MODE;
}

function normalizedReadInput(input) {
  const source = object(input);
  const startLine = positiveLineNumber(source.start_line) || 1;
  const requestedEndLine = positiveLineNumber(source.end_line);
  return {
    file_path: text(source.file_path, 1200),
    start_line: startLine,
    end_line: requestedEndLine || (startLine + DEFAULT_READ_WINDOW - 1),
  };
}

function normalizedSearchInput(input) {
  const source = object(input);
  const mode = normalizedSearchMode(source.mode);
  const query = text(source.query, 4000);

  if (mode === "path") {
    return {
      mode,
      query,
    };
  }

  if (mode === "glob") {
    const requestedGlobs = list(source.path_globs).length
      ? source.path_globs
      : query
        ? [query]
        : [];
    return {
      mode,
      query: query || null,
      path_globs: uniqueSorted(requestedGlobs),
    };
  }

  return {
    mode,
    query,
    paths: uniqueSorted(source.paths),
  };
}

export function normalizeCodeAIGuardedActionInput(action, input) {
  const source = object(input);
  if (action === "read") return normalizedReadInput(source);
  if (action === "search") return normalizedSearchInput(source);
  if (action === "run") {
    return {
      command: text(source.command, 300),
      args: list(source.args).map((item) => text(item, 1200)),
      cwd: text(source.cwd, 1200) || ".",
    };
  }
  return source;
}

export function codeAIGuardedActionFingerprint(action, input) {
  return createHash("sha256")
    .update(JSON.stringify({
      action,
      input: normalizeCodeAIGuardedActionInput(action, input),
    }))
    .digest("hex");
}

export const CodeAIAutonomyActionIdentity = Object.freeze({
  contract: CODE_AI_GUARDED_ACTION_IDENTITY_CONTRACT,
  default_search_mode: CODE_AI_DEFAULT_SEARCH_MODE,
  search_modes: CODE_AI_SEARCH_MODES,
  normalize: normalizeCodeAIGuardedActionInput,
  fingerprint: codeAIGuardedActionFingerprint,
});
