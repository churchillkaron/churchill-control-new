export const CODE_AI_SOURCE_CHANGE_CONTRACT =
  "AVANTIQO_CODE_AI_SOURCE_CHANGE_V1";

const OPERATIONS = new Set(["write", "delete"]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedOperation(value) {
  const operation = text(value, 40).toLowerCase() || "write";
  if (!OPERATIONS.has(operation)) {
    throw new Error(`CODE_AI_SOURCE_CHANGE_OPERATION_UNSUPPORTED:${operation}`);
  }
  return operation;
}

export function normalizeCodeAISourceChanges(value, {
  maxTotalWriteBytes = 1024 * 1024,
  requireUniquePaths = true,
} = {}) {
  const changes = list(value)
    .map((change) => {
      const path = text(change?.path, 2000).replaceAll("\\", "/");
      if (!path) return null;
      const operation = normalizedOperation(change?.operation);
      return {
        path,
        operation,
        content: operation === "delete" ? null : String(change?.content ?? ""),
      };
    })
    .filter(Boolean);

  if (requireUniquePaths) {
    const paths = new Set();
    for (const change of changes) {
      if (paths.has(change.path)) throw new Error("CODE_AI_SOURCE_CHANGE_DUPLICATE_PATH");
      paths.add(change.path);
    }
  }

  const totalWriteBytes = changes.reduce(
    (sum, change) => sum + (
      change.operation === "write"
        ? Buffer.byteLength(change.content, "utf8")
        : 0
    ),
    0,
  );
  if (totalWriteBytes > maxTotalWriteBytes) {
    throw new Error("CODE_AI_SOURCE_CHANGE_STATE_TOO_LARGE");
  }

  return changes;
}

export function codeAISourceChangePaths(value) {
  return [...new Set(
    normalizeCodeAISourceChanges(value, { requireUniquePaths: false })
      .map((change) => change.path),
  )];
}

function statusPayload(value) {
  const raw = String(value ?? "").replace(/\r$/, "");
  if (!raw) return "";
  return raw.length >= 4 && raw[2] === " "
    ? raw.slice(3)
    : raw.replace(/^[A-Z?!]{1,2}\s+/, "");
}

export function codeAIPathsFromGitStatusLine(value) {
  const payload = statusPayload(value);
  if (!payload) return [];
  if (payload.includes(" -> ")) {
    const [fromPath, toPath] = payload.split(" -> ");
    return [text(fromPath, 2000), text(toPath, 2000)].filter(Boolean);
  }
  return [text(payload, 2000)].filter(Boolean);
}

export function codeAIChangedPathsFromDiff(diff = {}) {
  return [...new Set(
    list(diff?.status).flatMap(codeAIPathsFromGitStatusLine).filter(Boolean),
  )];
}

export function codeAIEditAction(value) {
  return ["apply_files", "delete_files", "rename_files"].includes(
    text(value, 80).toLowerCase(),
  );
}

export const CodeAISourceChangePolicy = Object.freeze({
  contract: CODE_AI_SOURCE_CHANGE_CONTRACT,
  operations: [...OPERATIONS],
  normalize: normalizeCodeAISourceChanges,
  paths: codeAISourceChangePaths,
  changedPathsFromDiff: codeAIChangedPathsFromDiff,
  isEditAction: codeAIEditAction,
});

export default CodeAISourceChangePolicy;
