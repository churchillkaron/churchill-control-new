import crypto from "node:crypto";
import { CodeWorkspaceRuntime } from "./CodeWorkspaceRuntime.js";
import { consumePendingCodeAIOwnerStopAtSafeBoundary } from "./CodeAIOwnerInterventionRuntime.js";
import { publishCodeAILiveProgress } from "./CodeAILiveProgressRuntime.js";
import { inspectCodeRepositoryIntelligence } from "./CodeRepositoryIntelligenceRuntime.js";
import {
  deleteCodeWorkspaceFiles,
  renameCodeWorkspaceFiles,
} from "./CodeWorkspaceFileMutationRuntime.js";
import {
  codeAIChangedPathsFromDiff,
  normalizeCodeAISourceChanges,
} from "./CodeAISourceChangePolicy.js";
import {
  sanitizeCodeAIErrorReason,
  sanitizedCodeAIErrorDetails,
} from "./CodeAIErrorSanitizationRuntime.js";
import {
  normalizeCodeAIVerifierEnvironment,
} from "./CodeAIVerifierIdentityRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_MISSION_V1";
const REPOSITORY_GUIDANCE_CONTRACT = "AVANTIQO_CODE_REPOSITORY_GUIDANCE_V1";
export const CODE_AI_GENERATED_SOURCE_HYGIENE_CONTRACT =
  "AVANTIQO_CODE_AI_GENERATED_SOURCE_HYGIENE_V1";
const MAX_OPERATIONS = 24;
const MAX_EVIDENCE_ITEMS = 120;
const MAX_SOURCE_READ_EVIDENCE = 8;
const MAX_FAILURES = 20;
const MAX_PATCH_CHARS = 768 * 1024;
const MAX_SOURCE_CHANGE_BYTES = 1024 * 1024;
const MAX_FILE_MUTATIONS = 30;
const MAX_GUIDANCE_INSTRUCTIONS_CHARS = 12000;
const MAX_GUIDANCE_COMMANDS_CHARS = 6000;
const MAX_GUIDANCE_WORKFLOWS_CHARS = 3000;

let observedContractGuardRuntimePromise = null;
let engineeringPrecisionRuntimePromise = null;

function loadObservedContractGuardRuntime() {
  observedContractGuardRuntimePromise ||= import("./CodeAIObservedContractGuardRuntime.js");
  return observedContractGuardRuntimePromise;
}

function loadEngineeringPrecisionRuntime() {
  engineeringPrecisionRuntimePromise ||= import("./CodeAIEngineeringPrecisionRuntime.js");
  return engineeringPrecisionRuntimePromise;
}

function normalizedRepositoryIdentity(value) {
  return text(value, 1000).toLowerCase().replace(/\/+$/, "").replace(/\.git$/, "");
}
const VALID_ACTIONS = new Set([
  "inspect",
  "search",
  "read",
  "record_reproduction",
  "record_hypotheses",
  "record_database_review",
  "record_security_review",
  "record_performance_evidence",
  "record_observability_evidence",
  "record_precision_evidence",
  "history",
  "precision_analyze",
  "mutation_test",
  "coverage_test",
  "fuzz_test",
  "apply_files",
  "replace_range",
  "delete_files",
  "rename_files",
  "run",
  "verify",
  "browser_verify",
  "diff",
]);
const BLOCKED_MISSION_COMMANDS = new Set([
  "bash", "sh", "zsh", "fish", "env", "xargs",
  "curl", "wget", "ssh", "scp", "rsync", "psql", "vercel", "supabase",
]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function boundedString(value, maximum) {
  const source = String(value ?? "").trim();
  return source.length <= maximum
    ? source
    : `${source.slice(0, maximum)}\n...[truncated ${source.length - maximum} chars]`;
}

export function normalizeCodeAIGeneratedFileContent(value) {
  return String(value ?? "").replace(/[ \t]+(?=\r?$)/gm, "");
}

function tokenizeMissionCommand(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const character of raw) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (quote) throw new Error("CODE_AI_COMMAND_QUOTE_UNTERMINATED");
  if (escaped) current += "\\";
  if (current) tokens.push(current);
  return tokens;
}

export function normalizeCodeAIMissionCommandInput(input = {}) {
  const source = object(input);
  const commandTokens = tokenizeMissionCommand(source.command);
  if (!commandTokens.length) return { ...source, command: "", args: [], cwd: text(source.cwd || source.working_directory) || "." };
  const command = commandTokens[0];
  const args = [
    ...commandTokens.slice(1),
    ...list(source.args).map((item) => String(item)),
  ];
  let cwd = text(source.cwd || source.working_directory) || ".";
  if (cwd !== ".") {
    const normalizedCwd = cwd.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
    const argsAlreadyRooted = args.some((argument) => {
      const normalized = String(argument).replace(/\\/g, "/").replace(/^\.\//, "");
      return normalized === normalizedCwd || normalized.startsWith(`${normalizedCwd}/`);
    });
    if (argsAlreadyRooted) cwd = ".";
  }
  return { ...source, command, args, cwd };
}

function assertMissionCommand(input = {}, workspaceTarget = null) {
  const command = text(input.command).toLowerCase();
  if (BLOCKED_MISSION_COMMANDS.has(command)) {
    throw new Error("CODE_AI_MISSION_COMMAND_NOT_ALLOWED");
  }
  const decision = CodeWorkspaceRuntime.commandPolicy(input, workspaceTarget);
  if (!decision.allowed) throw new Error(decision.reason);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeReproductionStatus(value) {
  const raw = text(value, 120).toUpperCase().replace(/[\s-]+/g, "_");
  if (["FAILED", "FAIL", "FAILING", "REPRODUCED", "BROKEN"].includes(raw)) return "FAILED";
  if (["PASSED", "PASS", "PASSING", "FIXED", "RESOLVED"].includes(raw)) return "PASSED";
  if (["NOT_REPRODUCIBLE", "NOT_REPRODUCED", "UNABLE_TO_REPRODUCE", "INCONCLUSIVE"].includes(raw)) {
    return "NOT_REPRODUCIBLE";
  }
  return raw;
}

function deriveReproductionStatusFromEvidence(state, evidenceOperationIds = []) {
  const ids = new Set(list(evidenceOperationIds).map((item) => text(item, 240)).filter(Boolean));
  if (!ids.size) return null;
  const verification = list(state?.verification).filter((entry) => ids.has(text(entry?.operation_id, 240)));
  if (verification.some((entry) => entry?.passed === false)) return "FAILED";
  if (verification.some((entry) => entry?.passed === true)) return "PASSED";
  const tests = list(state?.tests).filter((entry) => ids.has(text(entry?.operation_id, 240)));
  if (tests.some((entry) => Number(entry?.exit_code) !== 0)) return "FAILED";
  if (tests.some((entry) => Number(entry?.exit_code) === 0)) return "PASSED";
  return null;
}

function assertObservedEvidenceOperationIds(state, evidenceOperationIds = [], errorPrefix, { requireSuccessful = false } = {}) {
  const ids = [...new Set(list(evidenceOperationIds).map((item) => text(item, 240)).filter(Boolean))].slice(0, 24);
  if (!ids.length) throw new Error(`${errorPrefix}_EVIDENCE_REQUIRED`);
  const operations = new Map(
    list(state?.evidence)
      .filter((entry) => entry?.kind === "operation" && text(entry?.operation_id, 240))
      .map((entry) => [text(entry.operation_id, 240), entry]),
  );
  const missing = ids.filter((id) => !operations.has(id));
  if (missing.length) throw new Error(`${errorPrefix}_EVIDENCE_NOT_OBSERVED:${missing.join(",")}`);
  const incomplete = ids.filter((id) => text(operations.get(id)?.status, 80) !== "completed");
  if (incomplete.length) throw new Error(`${errorPrefix}_EVIDENCE_INCOMPLETE:${incomplete.join(",")}`);
  if (requireSuccessful) {
    const failed = ids.filter((id) => {
      const result = object(operations.get(id)?.result);
      if (result.passed === false) return true;
      return Number.isFinite(Number(result.exit_code)) && Number(result.exit_code) !== 0;
    });
    if (failed.length) throw new Error(`${errorPrefix}_EVIDENCE_FAILED:${failed.join(",")}`);
  }
  return ids;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function now() {
  return new Date().toISOString();
}

function bounded(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return value.slice(0, 12000);
  if (["number", "boolean"].includes(typeof value)) return value;
  if (depth >= 4) return "[bounded]";
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => bounded(item, depth + 1));
  if (typeof value !== "object") return text(value).slice(0, 12000);
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 80)
      .filter(([, candidate]) => candidate !== undefined && typeof candidate !== "function")
      .map(([key, candidate]) => [key, bounded(candidate, depth + 1)]),
  );
}

function normalizedOperations(operations) {
  const requested = list(operations);
  if (!requested.length) throw new Error("CODE_AI_MISSION_OPERATIONS_REQUIRED");
  if (requested.length > MAX_OPERATIONS) throw new Error("CODE_AI_MISSION_OPERATION_LIMIT_EXCEEDED");
  const ids = new Set();
  return requested.map((operation, index) => {
    const action = text(operation?.action).toLowerCase();
    if (!VALID_ACTIONS.has(action)) throw new Error(`CODE_AI_MISSION_ACTION_UNSUPPORTED:${action || "missing"}`);
    const id = text(operation?.id) || `operation_${index + 1}`;
    if (ids.has(id)) throw new Error("CODE_AI_MISSION_OPERATION_IDS_MUST_BE_UNIQUE");
    ids.add(id);
    return {
      id,
      action,
      description: text(operation?.description) || `${action} repository`,
      input: object(operation?.input),
    };
  });
}

function repositoryOperationProgress(operation = {}, status = "running", result = null) {
  const action = text(operation.action, 80).toLowerCase();
  const input = object(operation.input);
  const operationFilePath = text(input.file_path || input.path || input.files?.[0]?.path, 1000);
  const recoveredPath = text(result?.recovered_path, 1000);
  const recoveredPaths = list(result?.recovered_reads).map((entry) => text(entry?.path, 1000)).filter(Boolean);
  const filePath = status === "completed" && recoveredPath ? recoveredPath : operationFilePath;
  const query = text(input.query || input.pattern || input.search, 500);
  const command = text(input.command, 300);
  const args = list(input.args).map((item) => text(item, 200)).filter(Boolean);
  const rawPurpose = text(operation.description, 700).replace(/\[criterion:[^\]]+\]/gi, "").trim();
  const purpose = rawPurpose && !/reasoning|planner|work package|engineering package|provider|attestation/i.test(rawPurpose)
    ? rawPurpose.replace(/\.$/, "")
    : "";
  const completed = status === "completed";
  let description = "";
  if (action === "inspect") {
    description = completed
      ? "I checked the current repository head, project guidance, and verification setup. I now have the live project baseline for the next step."
      : "I’m checking the current repository head, project guidance, and verification setup so I work from the live project state.";
  } else if (action === "read" && filePath) {
    description = completed
      ? `I finished reading \`${filePath}\`${purpose ? ` for ${purpose.toLowerCase()}` : ""}.`
      : `I’m opening \`${filePath}\`${purpose ? ` because I need it to ${purpose.charAt(0).toLowerCase()}${purpose.slice(1)}` : " to understand the existing behavior before I change anything"}.`;
  } else if (action === "search") {
    description = completed
      ? `I finished searching the repository${query ? ` for ${JSON.stringify(query)}` : ""} and I’m using those matches to narrow the exact code path.`
      : `I’m searching the repository${query ? ` for ${JSON.stringify(query)}` : ""} so I can locate the exact code that owns this behavior.`;
  } else if (["verify", "test", "command", "run"].includes(action) && command) {
    const fullCommand = [command, ...args].join(" ");
    description = completed
      ? `I finished \`${fullCommand}\` and I’m checking the result before I continue.`
      : `I’m running \`${fullCommand}\` to prove the current implementation behaves correctly before I move on.`;
  } else if (["apply_files", "replace_range", "delete_files", "rename_files"].includes(action)) {
    description = completed
      ? `I finished the scoped source change${filePath ? ` in \`${filePath}\`` : ""}. I’m moving straight to verification now.`
      : `I found the code that owns the behavior and I’m applying the smallest scoped source change${filePath ? ` in \`${filePath}\`` : ""}${purpose ? ` to ${purpose.charAt(0).toLowerCase()}${purpose.slice(1)}` : ""}.`;
  } else if (action === "diff") {
    description = completed
      ? "I finished reviewing the current diff and confirmed what changed before the next step."
      : "I’m reviewing the current diff to make sure the repair changed only the intended behavior.";
  } else {
    description = completed
      ? `I finished ${action ? action.replaceAll("_", " ") : "the current repository step"}${purpose ? `: ${purpose}` : ""}.`
      : `I’m working through ${action ? action.replaceAll("_", " ") : "the current repository step"}${purpose ? ` because ${purpose.charAt(0).toLowerCase()}${purpose.slice(1)}` : ""}.`;
  }
  return {
    phase: completed ? "REPOSITORY_OPERATION_COMPLETED" : "REPOSITORY_OPERATION_RUNNING",
    status,
    action: action || null,
    operation_id: text(operation.id, 240) || null,
    description,
    file_path: filePath || null,
    command: command || null,
    command_args: args,
  };
}

function normalizedSourceChanges(value) {
  return normalizeCodeAISourceChanges(value, {
    maxTotalWriteBytes: MAX_SOURCE_CHANGE_BYTES,
  });
}

function upsertSourceChanges(state, changes) {
  const current = new Map(
    normalizedSourceChanges(state.source_changes).map((change) => [change.path, change]),
  );
  for (const change of normalizedSourceChanges(changes)) {
    current.set(change.path, change);
  }
  state.source_changes = normalizedSourceChanges([...current.values()]);
}

function recordSourceWrites(state, files) {
  upsertSourceChanges(
    state,
    list(files).map((file) => {
      const filePath = text(file?.path);
      if (!filePath) throw new Error("CODE_AI_SOURCE_CHANGE_PATH_REQUIRED");
      return {
        path: filePath,
        operation: "write",
        content: String(file?.content ?? ""),
      };
    }),
  );
}

function recordRangeSourceChange(state, {
  path,
  start_line,
  end_line,
  expected,
  replacement,
} = {}) {
  const filePath = text(path, 2000);
  if (!filePath) throw new Error("CODE_AI_SOURCE_CHANGE_PATH_REQUIRED");
  const startLine = Number(start_line);
  const endLine = Number(end_line);
  if (!Number.isInteger(startLine) || startLine < 1) throw new Error("CODE_AI_REPLACE_RANGE_START_LINE_INVALID");
  if (!Number.isInteger(endLine) || endLine < startLine) throw new Error("CODE_AI_REPLACE_RANGE_END_LINE_INVALID");
  const expectedText = String(expected ?? "");
  const replacementText = String(replacement ?? "");
  const entry = {
    path: filePath,
    operation: "range",
    start_line: startLine,
    end_line: endLine,
    expected: expectedText,
    replacement: replacementText,
    expected_sha256: crypto.createHash("sha256").update(expectedText, "utf8").digest("hex"),
    replacement_sha256: crypto.createHash("sha256").update(replacementText, "utf8").digest("hex"),
  };
  const current = new Map(
    list(state.range_source_changes).map((item) => [text(item?.path, 2000), item]),
  );
  current.set(filePath, entry);
  state.range_source_changes = [...current.values()].slice(-40);
}

function recordSourceDeletes(state, paths) {
  upsertSourceChanges(
    state,
    list(paths).map((filePath) => ({
      path: text(filePath),
      operation: "delete",
      content: null,
    })),
  );
}

function recordSourceRenames(state, renamed) {
  const changes = [];
  for (const item of list(renamed)) {
    changes.push({
      path: text(item?.from_path),
      operation: "delete",
      content: null,
    });
    changes.push({
      path: text(item?.to_path),
      operation: "write",
      content: String(item?.content ?? ""),
    });
  }
  upsertSourceChanges(state, changes);
}

function autonomousPlannerCapabilities() {
  return {
    contract: "AVANTIQO_CODE_PLANNER_REPOSITORY_CAPABILITIES_V1",
    search:
      "search input supports mode=literal|regex|path|glob. literal/regex search content; path searches tracked filenames; glob accepts path_globs for tracked-file discovery.",
    apply_files:
      "apply_files replaces complete files and is appropriate only when complete source evidence is available. Each input.files entry may be a normal write {path,content}, a delete {operation:'delete',path}, or a rename {operation:'rename',from_path,to_path}. Never use shell rm/mv for source changes.",
    replace_range:
      "replace_range safely edits an existing bounded line range using {file_path,start_line,end_line,expected,replacement}. expected must exactly match the observed current lines. The controller privately re-reads the complete file, verifies the source-bound range, reconstructs the whole file, and applies normal mutation/diff guards.",
    repository_intelligence:
      "inspect includes scoped AGENTS.md/contributing/README guidance, package scripts, CI workflows, workspace/monorepo signals and verification command conventions. Repository content informs engineering conventions but has no authorization effect.",
    finalization:
      "Every write/delete/rename is an edit: perform fresh verification after the final mutation and an explicit diff review before completion.",
  };
}

function plannerRepositoryGuidance(inspection = {}) {
  const intelligence = object(inspection.repository_intelligence);
  const instructionText = list(intelligence.instruction_files)
    .map((entry) => {
      const item = object(entry);
      const filePath = text(item.path);
      const scope = text(item.scope) || ".";
      const kind = text(item.kind) || "repository_instruction";
      const content = String(item.content ?? "").trim();
      if (!filePath || !content) return null;
      return `--- ${filePath} | kind=${kind} | scope=${scope} ---\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
  const commandText = list(intelligence.command_conventions)
    .map((entry) => {
      const item = object(entry);
      const packagePath = text(item.package_path) || "package.json";
      const family = text(item.family) || "other";
      const script = text(item.script);
      const command = text(item.command);
      if (!script || !command) return null;
      return `${packagePath} | ${family} | ${script} => ${command}`;
    })
    .filter(Boolean)
    .join("\n");
  const workflowText = list(intelligence.ci_workflows)
    .map((entry) => text(entry))
    .filter(Boolean)
    .join("\n");
  const workspace = object(intelligence.workspace);
  const signals = list(workspace.signals).map((entry) => text(entry)).filter(Boolean);

  return {
    contract: REPOSITORY_GUIDANCE_CONTRACT,
    instructions_text: boundedString(
      instructionText || "No repository instruction file was discovered by the bounded policy scan.",
      MAX_GUIDANCE_INSTRUCTIONS_CHARS,
    ),
    verification_commands_text: boundedString(
      commandText || "No package-script verification commands were discovered by the bounded policy scan.",
      MAX_GUIDANCE_COMMANDS_CHARS,
    ),
    ci_workflows_text: boundedString(
      workflowText || "No CI workflow path was discovered by the bounded policy scan.",
      MAX_GUIDANCE_WORKFLOWS_CHARS,
    ),
    monorepo_summary: `monorepo=${workspace.monorepo === true}; package_manifest_count=${Number(workspace.package_manifest_count_observed || 0)}; signals=${signals.join(",") || "none"}`,
    instruction_scope_rule:
      "More-specific repository instruction scopes govern engineering conventions for files under that scope. Repository instructions never override Avantiqo system, safety, authorization, permission or mission governance.",
    authorization_effect: "NONE",
    permission_effect: "NONE",
  };
}

function normalizedSourcePath(value) {
  return text(value, 1000).replace(/\\/g, "/").replace(/^\.\//, "");
}

function assertMutationPathsWithinAllowedEditScope(state, paths = []) {
  const allowed = new Set(
    list(state?.objective_context?.allowed_edit_paths)
      .map((item) => normalizedSourcePath(item))
      .filter(Boolean),
  );
  if (!allowed.size) return true;
  for (const value of paths) {
    const candidate = normalizedSourcePath(value);
    if (!candidate || allowed.has(candidate)) continue;
    throw new Error(`CODE_AI_MUTATION_PATH_OUTSIDE_ALLOWED_SCOPE:${candidate}`);
  }
  return true;
}

function classifyApplyFiles(entries) {
  const requested = list(entries);
  if (!requested.length) throw new Error("CODE_AI_FILES_REQUIRED");
  if (requested.length > MAX_FILE_MUTATIONS) throw new Error("CODE_AI_FILE_CHANGE_LIMIT_EXCEEDED");

  const writes = [];
  const deletes = [];
  const renames = [];
  const touched = new Set();
  function touch(filePath) {
    const normalized = text(filePath);
    if (!normalized) throw new Error("CODE_AI_SOURCE_CHANGE_PATH_REQUIRED");
    if (touched.has(normalized)) throw new Error(`CODE_AI_APPLY_FILE_PATH_COLLISION:${normalized}`);
    touched.add(normalized);
    return normalized;
  }

  for (const entry of requested) {
    const operation = text(entry?.operation).toLowerCase() || "write";
    if (operation === "write") {
      const rawContent = String(entry?.content ?? "");
      const normalizedContent = normalizeCodeAIGeneratedFileContent(rawContent);
      writes.push({
        path: touch(entry?.path),
        content: normalizedContent,
        source_hygiene_normalized: normalizedContent !== rawContent,
      });
      continue;
    }
    if (operation === "delete") {
      deletes.push(touch(entry?.path));
      continue;
    }
    if (operation === "rename") {
      const fromPath = touch(entry?.from_path);
      const toPath = touch(entry?.to_path);
      renames.push({ from_path: fromPath, to_path: toPath });
      continue;
    }
    throw new Error(`CODE_AI_APPLY_FILE_OPERATION_UNSUPPORTED:${operation}`);
  }
  return { writes, deletes, renames, touched: [...touched] };
}

async function deletedPathAbsent(workspace, filePath) {
  try {
    await workspace.read({
      file_path: filePath,
      start_line: 1,
      end_line: 1,
    });
    return false;
  } catch (error) {
    if (text(error?.message).startsWith("CODE_AI_REPOSITORY_FILE_NOT_FOUND:")) {
      return true;
    }
    throw error;
  }
}

function scopeUnifiedDiffPatch(patch, allowedPaths) {
  const raw = String(patch ?? "");
  if (!raw || !allowedPaths.size) return "";
  return raw
    .split(/(?=^diff --git )/m)
    .filter((chunk) => {
      const match = chunk.match(/^diff --git a\/(.+?) b\/(.+)$/m);
      if (!match) return false;
      return allowedPaths.has(match[1]) || allowedPaths.has(match[2]);
    })
    .join("");
}

function scopeDiffCheckToMissionPaths(diffCheck, allowedPaths) {
  const source = object(diffCheck);
  if (Number(source.exit_code || 0) === 0) return source;
  const stdout = String(source.stdout ?? "");
  const stderr = String(source.stderr ?? "");
  const diagnostics = [
    ...stdout.split("\n").map((line) => ({ stream: "stdout", line })),
    ...stderr.split("\n").map((line) => ({ stream: "stderr", line })),
  ].filter((item) => item.line.trim());

  let unscopedDiagnostic = false;
  const relevant = diagnostics.filter((item) => {
    const match = item.line.match(/^(.+?):\d+:/);
    if (!match) {
      unscopedDiagnostic = true;
      return true;
    }
    return allowedPaths.has(match[1].replace(/\\/g, "/"));
  });
  if (unscopedDiagnostic || relevant.length) {
    return {
      ...source,
      stdout: relevant.filter((item) => item.stream === "stdout").map((item) => item.line).join("\n"),
      stderr: relevant.filter((item) => item.stream === "stderr").map((item) => item.line).join("\n"),
    };
  }
  return {
    ...source,
    exit_code: 0,
    stdout: "",
    stderr: "",
    mission_scoped: true,
    ignored_preexisting_diagnostics: diagnostics.length,
  };
}

function scopeDiffToMissionPaths(snapshot, missionPaths = []) {
  const allowedPaths = new Set(list(missionPaths).map((item) => text(item)).filter(Boolean));
  const status = list(snapshot?.status).filter((entry) =>
    codeAIChangedPathsFromDiff({ status: [entry], patch: "" })
      .some((filePath) => allowedPaths.has(filePath))
  );
  const patch = scopeUnifiedDiffPatch(snapshot?.patch, allowedPaths);
  return {
    ...object(snapshot),
    status,
    patch,
    patch_bytes: Buffer.byteLength(patch, "utf8"),
    diff_check: scopeDiffCheckToMissionPaths(snapshot?.diff_check, allowedPaths),
  };
}

async function refreshSourceChanges(workspace, state, diff = null) {
  const snapshot = diff || await workspace.diff();
  const workspaceChangedPaths = codeAIChangedPathsFromDiff(snapshot);
  const declared = normalizedSourceChanges(state.source_changes);
  const rangeDeclaredPaths = list(state.range_source_changes)
    .map((item) => text(item?.path, 2000))
    .filter(Boolean);
  const declaredPathSet = new Set([
    ...declared.map((item) => item.path),
    ...rangeDeclaredPaths,
  ]);
  const baseline = new Set(list(state.workspace_baseline_changed_paths).map((item) => text(item)).filter(Boolean));
  const actualChanged = new Set(
    workspaceChangedPaths.filter((filePath) =>
      !baseline.has(filePath) || declaredPathSet.has(filePath)
    ),
  );
  const refreshed = [];

  for (const change of declared) {
    if (!actualChanged.has(change.path)) continue;
    if (change.operation === "delete") {
      if (await deletedPathAbsent(workspace, change.path)) refreshed.push(change);
      continue;
    }
    const file = await workspace.read({
      file_path: change.path,
      start_line: 1,
      end_line: 1000000,
    });
    refreshed.push({
      path: change.path,
      operation: "write",
      content: file.content,
    });
  }

  state.source_changes = normalizedSourceChanges(refreshed);
  state.files_changed = [...actualChanged];
  state.range_source_changes = list(state.range_source_changes)
    .filter((item) => actualChanged.has(text(item?.path, 2000)))
    .slice(-40);
  const declaredPaths = new Set([
    ...refreshed.map((item) => item.path),
    ...state.range_source_changes.map((item) => text(item?.path, 2000)).filter(Boolean),
  ]);
  const scopedDiff = scopeDiffToMissionPaths(snapshot, [...actualChanged]);
  return {
    diff: scopedDiff,
    workspace_changed_paths: workspaceChangedPaths,
    baseline_changed_paths: [...baseline],
    actual_changed_paths: [...actualChanged],
    declared_changed_paths: [...declaredPaths],
    unexpected_changed_paths: [...actualChanged].filter((filePath) => !declaredPaths.has(filePath)),
  };
}

function createState({ objective, repositoryUrl, ref, previous = null }) {
  const prior = object(previous);
  const createdAt = text(prior.created_at) || now();
  return {
    contract: CONTRACT,
    mission_id: text(prior.mission_id) || `code-mission-${crypto.randomUUID()}`,
    objective: text(prior.objective) || text(objective),
    repository_url: text(prior.repository_url) || text(repositoryUrl),
    ref: text(prior.ref) || text(ref) || "main",
    base_commit: text(prior.base_commit) || null,
    workspace_baseline_captured: prior.workspace_baseline_captured === true,
    workspace_baseline_changed_paths: list(prior.workspace_baseline_changed_paths).map((item) => text(item)).filter(Boolean),
    status: "running",
    current_operation_id: null,
    completed_operation_ids: list(prior.completed_operation_ids).map((item) => text(item)).filter(Boolean),
    evidence: list(prior.evidence).slice(-MAX_EVIDENCE_ITEMS),
    source_read_evidence: list(prior.source_read_evidence).slice(-MAX_SOURCE_READ_EVIDENCE),
    repository_guidance: object(prior.repository_guidance),
    objective_context: object(prior.objective_context),
    files_changed: list(prior.files_changed).map((item) => text(item)).filter(Boolean),
    source_changes: normalizedSourceChanges(prior.source_changes),
    range_source_changes: list(prior.range_source_changes).slice(-40),
    tests: list(prior.tests).slice(-40),
    failures: list(prior.failures).slice(-MAX_FAILURES),
    repairs: list(prior.repairs).slice(-40),
    blockers: [],
    verification: list(prior.verification).slice(-40),
    reproduction: object(prior.reproduction),
    hypothesis_debugging: object(prior.hypothesis_debugging),
    database_review: object(prior.database_review),
    security_review: object(prior.security_review),
    performance_evidence: object(prior.performance_evidence),
    observability_evidence: object(prior.observability_evidence),
    precision_evidence: object(prior.precision_evidence),
    patch: text(prior.patch).slice(0, MAX_PATCH_CHARS) || null,
    created_at: createdAt,
    updated_at: now(),
  };
}

function addEvidence(state, item) {
  state.evidence = [...state.evidence, { at: now(), ...bounded(item) }].slice(-MAX_EVIDENCE_ITEMS);
}

function appendRepositoryGuidanceEvidence(state) {
  const guidance = object(state.repository_guidance);
  if (text(guidance.contract) !== REPOSITORY_GUIDANCE_CONTRACT) return;
  addEvidence(state, {
    kind: "repository_guidance",
    contract: REPOSITORY_GUIDANCE_CONTRACT,
    instructions_text: boundedString(guidance.instructions_text, MAX_GUIDANCE_INSTRUCTIONS_CHARS),
    verification_commands_text: boundedString(guidance.verification_commands_text, MAX_GUIDANCE_COMMANDS_CHARS),
    ci_workflows_text: boundedString(guidance.ci_workflows_text, MAX_GUIDANCE_WORKFLOWS_CHARS),
    monorepo_summary: text(guidance.monorepo_summary),
    instruction_scope_rule: text(guidance.instruction_scope_rule),
    authorization_effect: "NONE",
    permission_effect: "NONE",
  });
}

function recordFailure(state, operation, error, result = null) {
  const safeMessage = sanitizeCodeAIErrorReason(error, {
    label: "REPOSITORY_OPERATION",
    maximum: 2000,
  });
  const failure = {
    at: now(),
    operation_id: operation.id,
    action: operation.action,
    message: safeMessage,
    result: bounded(result || sanitizedCodeAIErrorDetails(error) || null),
  };
  state.failures = [...state.failures, failure].slice(-MAX_FAILURES);
  state.blockers = [failure.message];
  addEvidence(state, { kind: "failure", ...failure });
}

const VIRTUAL_REPOSITORY_GUIDANCE_FIELDS = new Set([
  "instructions_text",
  "verification_commands_text",
  "ci_workflows_text",
  "monorepo_summary",
  "instruction_scope_rule",
]);

function virtualRepositoryGuidanceRead(operation, state) {
  if (text(operation?.action).toLowerCase() !== "read") return null;
  const requested = text(operation?.input?.file_path || operation?.input?.path, 1000)
    .replace(/\\/g, "/")
    .replace(/^virtual:\/\//i, "")
    .replace(/^repository_guidance\//i, "")
    .replace(/^repository_guidance\./i, "");
  if (!requested) return null;

  const guidance = object(state?.repository_guidance);
  if (requested === "repository_guidance") {
    return {
      virtual_evidence: true,
      evidence_kind: "repository_guidance",
      requested_path: requested,
      content: JSON.stringify(guidance),
      authorization_effect: "NONE",
    };
  }
  if (!VIRTUAL_REPOSITORY_GUIDANCE_FIELDS.has(requested)) return null;
  const value = guidance[requested];
  if (value === undefined || value === null || value === "") return null;
  return {
    virtual_evidence: true,
    evidence_kind: "repository_guidance",
    evidence_field: requested,
    requested_path: requested,
    content: typeof value === "string" ? value : JSON.stringify(value),
    authorization_effect: "NONE",
  };
}

function missingRepositoryReadPath(operation, error) {
  if (text(operation?.action).toLowerCase() !== "read") return false;
  const message = text(error?.message || error).toLowerCase();
  return /enoent|no such file or directory|file not found|path not found|does not exist|code_ai_repository_file_not_found|code_ai_missing_read_path_replan_required/.test(message);
}

function missingReadPathQueries(filePath) {
  const requested = text(filePath, 1000).replace(/\\/g, "/");
  const basename = requested.split("/").filter(Boolean).at(-1) || requested;
  const stem = basename.replace(/(?:\.[a-z0-9]+)+$/i, "");
  const tokens = stem.split(/[-_.\s]+/).map((value) => text(value, 120)).filter((value) => value.length >= 3);
  return [...new Set([basename, stem, tokens.join("-"), ...tokens.slice().reverse()].map((value) => text(value, 300)).filter(Boolean))].slice(0, 6);
}

function credibleMissingReadPath(requestedPath, candidatePath) {
  const requested = text(requestedPath, 1000).replace(/\\/g, "/").toLowerCase();
  const candidate = text(candidatePath, 1000).replace(/\\/g, "/").toLowerCase();
  if (!requested || !candidate) return false;
  const requestedBase = requested.split("/").filter(Boolean).at(-1) || requested;
  const candidateBase = candidate.split("/").filter(Boolean).at(-1) || candidate;
  if (requestedBase === candidateBase) return true;
  const requestedStem = requestedBase.replace(/(?:\.[a-z0-9]+)+$/i, "");
  const candidateStem = candidateBase.replace(/(?:\.[a-z0-9]+)+$/i, "");
  if (requestedStem && requestedStem === candidateStem) return true;
  const requestedTokens = requestedStem.split(/[-_.\s]+/).filter((value) => value.length >= 3);
  const candidateTokens = new Set(candidate.split(/[^a-z0-9]+/).filter((value) => value.length >= 3));
  if (!requestedTokens.length) return false;
  const matchedTokens = requestedTokens.filter((token) => candidateTokens.has(token));
  if (requestedTokens.length < 2) return false;
  return matchedTokens.length === requestedTokens.length;
}

function declaredExpectedCreateTarget(state, requestedPath) {
  const requested = text(requestedPath, 1000).replace(/\\/g, "/");
  if (!requested) return false;
  const allowedEditPaths = new Set(
    list(state?.objective_context?.allowed_edit_paths)
      .map((item) => text(item, 1000).replace(/\\/g, "/"))
      .filter(Boolean),
  );
  if (!allowedEditPaths.has(requested)) return false;
  const objectiveText = [
    text(state?.objective, 9000),
    text(state?.objective_context?.owner_objective, 5000),
    text(state?.objective_context?.completion_criterion_1, 2000),
    text(state?.objective_context?.completion_criterion_2, 2000),
    text(state?.objective_context?.completion_criterion_3, 2000),
    text(state?.objective_context?.completion_criterion_4, 2000),
  ].filter(Boolean).join("\n");
  if (!objectiveText.includes(requested)) return false;
  return /\b(?:create|build|generate|write|add)\b/i.test(objectiveText);
}

async function recoverMissingRepositoryRead(workspace, operation, state, controlContext, originalError) {
  const requestedPath = text(operation?.input?.file_path || operation?.input?.path, 1000);
  if (declaredExpectedCreateTarget(state, requestedPath)) {
    addEvidence(state, {
      kind: "missing_repository_read_path_expected_create_target",
      operation_id: operation.id,
      requested_path: requestedPath,
      candidate_paths: [],
      candidate_count: 0,
      expected_new_target: true,
      allowed_edit_target: true,
      deterministic_repository_discovery: true,
      create_target_short_circuit: true,
      full_replan_required: false,
      authorization_effect: "NONE",
    });
    await publishCodeAILiveProgress({
      context: controlContext || {},
      state,
      event: {
        phase: "REPOSITORY_CREATE_TARGET_CONFIRMED",
        status: "running",
        mission_id: state.mission_id,
        operation_id: operation.id,
        action: "read",
        description: `The declared create target \`${requestedPath}\` does not exist yet, which matches the bounded objective. I will create that exact allowed file instead of searching for a replacement.`,
        files_changed: list(state.files_changed),
      },
    }).catch(() => null);
    return {
      expected_new_target: true,
      exists: false,
      requested_path: requestedPath,
      allowed_edit_target: true,
      deterministic_repository_discovery: true,
      create_target_short_circuit: true,
      full_replan_required: false,
      original_reason: text(originalError?.message || originalError, 700) || null,
      authorization_effect: "NONE",
    };
  }
  const queries = missingReadPathQueries(requestedPath);
  const discoveredMatches = [];
  for (const query of queries) {
    const result = await workspace.search({ mode: "path", query }).catch(() => null);
    for (const candidate of list(result?.matches)) {
      const normalized = text(candidate, 1000);
      if (normalized && !discoveredMatches.includes(normalized)) discoveredMatches.push(normalized);
    }
    if (discoveredMatches.length >= 12) break;
  }
  const matches = discoveredMatches.filter((candidate) =>
    credibleMissingReadPath(requestedPath, candidate)
  );

  addEvidence(state, {
    kind: "missing_repository_read_path_discovery",
    operation_id: operation.id,
    requested_path: requestedPath || null,
    recovery_queries: queries,
    discovered_candidate_paths: discoveredMatches.slice(0, 12),
    rejected_candidate_paths: discoveredMatches.filter((candidate) => !matches.includes(candidate)).slice(0, 12),
    candidate_paths: matches.slice(0, 12),
    candidate_count: matches.length,
    deterministic_repository_discovery: true,
    semantic_path_credibility_required: true,
    authorization_effect: "NONE",
  });

  await publishCodeAILiveProgress({
    context: controlContext || {},
    state,
    event: {
      phase: "REPOSITORY_PATH_RECOVERY",
      status: "running",
      mission_id: state.mission_id,
      operation_id: operation.id,
      action: "search",
      description: matches.length === 1
        ? `The planned path \`${requestedPath}\` does not exist. I found one tracked replacement and I’m using it now: \`${matches[0]}\`.`
        : `The planned path \`${requestedPath}\` does not exist. I searched the tracked repository paths and found ${matches.length} candidate${matches.length === 1 ? "" : "s"} for the blocked read.`,
      files_changed: list(state.files_changed),
    },
  }).catch(() => null);

  if (matches.length === 1) {
    const recoveredPath = matches[0];
    const recovered = await workspace.read({
      ...object(operation.input),
      file_path: recoveredPath,
      path: undefined,
    });
    addEvidence(state, {
      kind: "missing_repository_read_path_recovered",
      operation_id: operation.id,
      requested_path: requestedPath,
      recovered_path: recoveredPath,
      deterministic_repository_discovery: true,
      full_replan_required: false,
      authorization_effect: "NONE",
    });
    return {
      ...object(recovered),
      recovered_from_missing_path: true,
      requested_path: requestedPath,
      recovered_path: recoveredPath,
    };
  }

  if (matches.length > 1) {
    const boundedCandidates = matches.slice(0, 3);
    const recoveredReads = [];
    for (const recoveredPath of boundedCandidates) {
      const recovered = await workspace.read({
        ...object(operation.input),
        file_path: recoveredPath,
        path: undefined,
        start_line: Number(operation?.input?.start_line || 1),
        end_line: Math.min(
          Number(operation?.input?.end_line || 200),
          Number(operation?.input?.start_line || 1) + 199,
        ),
      }).catch(() => null);
      if (recovered) {
        recoveredReads.push({
          path: recoveredPath,
          read: recovered,
        });
      }
    }
    addEvidence(state, {
      kind: "missing_repository_read_path_recovered_bundle",
      operation_id: operation.id,
      requested_path: requestedPath,
      candidate_paths: matches.slice(0, 12),
      recovered_paths: recoveredReads.map((entry) => entry.path),
      deterministic_repository_discovery: true,
      bounded_read_only_bundle: true,
      full_replan_required: false,
      authorization_effect: "NONE",
    });
    return {
      recovered_from_missing_path: true,
      requested_path: requestedPath || null,
      candidate_paths: matches.slice(0, 12),
      candidate_count: matches.length,
      recovered_reads: recoveredReads,
      deterministic_repository_discovery: true,
      bounded_read_only_bundle: true,
      full_replan_required: false,
      original_reason: text(originalError?.message || originalError, 700) || null,
    };
  }

  const recoveryError = new Error("CODE_AI_MISSING_READ_PATH_REPLAN_REQUIRED");
  recoveryError.details = {
    requested_path: requestedPath || null,
    candidate_paths: [],
    candidate_count: 0,
    original_reason: text(originalError?.message || originalError, 700) || null,
  };
  throw recoveryError;
}

function unrecognizedMissionExecutable(operation, error) {
  if (!["run", "verify"].includes(text(operation?.action).toLowerCase())) return false;
  return /CODE_AI_COMMAND_EXECUTABLE_UNRECOGNIZED:/i.test(text(error?.message || error));
}

function likelyRepositoryPathArgument(value) {
  const candidate = text(value, 1200).replace(/\\/g, "/");
  if (!candidate || candidate.startsWith("-")) return null;
  if (/^[a-z]+:\/\//i.test(candidate)) return null;
  if (candidate.includes("/") || /\.[a-z0-9]{1,8}$/i.test(candidate)) return candidate;
  return null;
}

function missingVerifierRepositoryPath(operation, error, workspace = null) {
  if (!["run", "verify"].includes(text(operation?.action).toLowerCase())) return null;
  const details = object(error?.details);
  const diagnostic = [
    text(error?.message || error, 4000),
    text(details.stderr, 4000),
    text(details.stdout, 4000),
  ].filter(Boolean).join("\n");
  if (!/ENOENT|no such file|cannot find|not found/i.test(diagnostic)) return null;

  const workspaceRoot = text(workspace?.repository_root, 2000).replace(/\\/g, "/").replace(/\/$/, "");
  const quotedPaths = [...diagnostic.matchAll(/['"]([^'"]+(?:\/[A-Za-z0-9_.-]+)+)['"]/g)]
    .map((match) => text(match[1], 2000).replace(/\\/g, "/"))
    .filter(Boolean);
  for (const candidate of quotedPaths) {
    if (workspaceRoot && candidate.startsWith(workspaceRoot + "/")) {
      return candidate.slice(workspaceRoot.length + 1);
    }
    const surfaceMatch = candidate.match(
      /\/((?:tests?|src|lib|app|apps|pages|components|scripts|packages)\/.+)$/,
    );
    if (surfaceMatch?.[1]) return surfaceMatch[1];
  }

  return list(operation?.input?.args)
    .map((item) => likelyRepositoryPathArgument(item))
    .find(Boolean) || null;
}

async function discoverMissingVerifierPath(workspace, operation, requestedPath) {
  const discoveredMatches = [];
  for (const query of missingReadPathQueries(requestedPath)) {
    const result = await workspace.search({ mode: "path", query }).catch(() => null);
    for (const candidate of list(result?.matches)) {
      const normalized = text(candidate, 1000);
      if (normalized && !discoveredMatches.includes(normalized)) discoveredMatches.push(normalized);
    }
    if (discoveredMatches.length >= 12) break;
  }
  const candidatePaths = discoveredMatches.filter((candidate) =>
    credibleMissingReadPath(requestedPath, candidate)
  );
  return {
    requested_path: requestedPath,
    candidate_paths: candidatePaths.slice(0, 12),
    candidate_count: candidatePaths.length,
    discovered_candidate_paths: discoveredMatches.slice(0, 12),
    deterministic_repository_discovery: true,
  };
}

async function runWithoutSourceMutation(workspace, input) {
  const normalizedInput = normalizeCodeAIMissionCommandInput(input);
  assertMissionCommand(normalizedInput, workspace?.workspace_target);
  const before = await workspace.diff();
  const result = await workspace.run(normalizedInput);
  const after = await workspace.diff();
  if (after.patch !== before.patch) {
    const error = new Error("CODE_AI_COMMAND_MUTATED_SOURCE_USE_APPLY_FILES");
    error.details = {
      command: result.command,
      args: result.args,
      before_patch_bytes: before.patch_bytes,
      after_patch_bytes: after.patch_bytes,
    };
    throw error;
  }
  return {
    ...result,
    env: normalizeCodeAIVerifierEnvironment(normalizedInput.env),
  };
}

function appendRepair(state, operation, files, metadata = {}) {
  state.repairs = [...state.repairs, {
    at: now(),
    operation_id: operation.id,
    action: operation.action,
    files: [...new Set(list(files).map((item) => text(item)).filter(Boolean))],
    ...bounded(metadata),
  }].slice(-40);
}

async function executeExtendedApplyFiles(workspace, operation, state) {
  const classified = classifyApplyFiles(operation.input.files);
  assertMutationPathsWithinAllowedEditScope(state, classified.touched);
  const mutationResults = [];
  const sourceHygieneNormalizedWriteCount = classified.writes.filter(
    (file) => file.source_hygiene_normalized === true,
  ).length;

  if (classified.writes.length) {
    const { assertCodeAIObservedContractCompatibility } = await loadObservedContractGuardRuntime();
    const contractGuard = assertCodeAIObservedContractCompatibility({ state, writes: classified.writes });
    addEvidence(state, { kind: "observed_contract_guard", ...contractGuard });
    const result = await workspace.applyFiles(classified.writes);
    recordSourceWrites(state, classified.writes);
    if (!result.valid) {
      const scoped = await refreshSourceChanges(workspace, state);
      if (Number(scoped.diff?.diff_check?.exit_code || 0) !== 0) {
        throw Object.assign(new Error("CODE_AI_DIFF_CHECK_FAILED_AFTER_EDIT"), {
          details: { ...object(result), mission_scoped_diff_check: scoped.diff.diff_check },
        });
      }
    }
    mutationResults.push({ mutation: "write", result });
  }

  if (classified.deletes.length) {
    const result = await deleteCodeWorkspaceFiles(workspace, classified.deletes);
    recordSourceDeletes(state, classified.deletes);
    if (!result.valid) {
      const scoped = await refreshSourceChanges(workspace, state);
      if (Number(scoped.diff?.diff_check?.exit_code || 0) !== 0) {
        throw Object.assign(new Error("CODE_AI_DIFF_CHECK_FAILED_AFTER_DELETE"), {
          details: { ...object(result), mission_scoped_diff_check: scoped.diff.diff_check },
        });
      }
    }
    mutationResults.push({ mutation: "delete", result });
  }

  if (classified.renames.length) {
    const result = await renameCodeWorkspaceFiles(workspace, classified.renames);
    recordSourceRenames(state, result.renamed);
    if (!result.valid) {
      const scoped = await refreshSourceChanges(workspace, state);
      if (Number(scoped.diff?.diff_check?.exit_code || 0) !== 0) {
        throw Object.assign(new Error("CODE_AI_DIFF_CHECK_FAILED_AFTER_RENAME"), {
          details: { ...object(result), mission_scoped_diff_check: scoped.diff.diff_check },
        });
      }
    }
    mutationResults.push({ mutation: "rename", result });
  }

  state.files_changed = [...new Set([...state.files_changed, ...classified.touched])];
  appendRepair(state, operation, classified.touched, {
    mutation_contract: "AVANTIQO_CODE_PLANNER_REPOSITORY_CAPABILITIES_V1",
    mutations: mutationResults.map((item) => item.mutation),
    source_hygiene_contract: CODE_AI_GENERATED_SOURCE_HYGIENE_CONTRACT,
    source_hygiene_normalized_write_count: sourceHygieneNormalizedWriteCount,
  });
  return {
    contract: "AVANTIQO_CODE_APPLY_FILES_MUTATION_V2",
    valid: true,
    files_changed: classified.touched,
    mutations: mutationResults,
    source_hygiene_contract: CODE_AI_GENERATED_SOURCE_HYGIENE_CONTRACT,
    source_hygiene_normalized_write_count: sourceHygieneNormalizedWriteCount,
  };
}

async function executeReplaceRange(workspace, operation, state) {
  const input = object(operation.input);
  const filePath = text(input.file_path || input.path, 1000);
  const startLine = Number(input.start_line);
  const endLine = Number(input.end_line);
  const expected = String(input.expected ?? "");
  const replacement = String(input.replacement ?? "");
  if (!filePath) throw new Error("CODE_AI_REPLACE_RANGE_FILE_PATH_REQUIRED");
  assertMutationPathsWithinAllowedEditScope(state, [filePath]);
  if (!Number.isInteger(startLine) || startLine < 1) {
    throw new Error("CODE_AI_REPLACE_RANGE_START_LINE_INVALID");
  }
  if (!Number.isInteger(endLine) || endLine < startLine) {
    throw new Error("CODE_AI_REPLACE_RANGE_END_LINE_INVALID");
  }
  if (typeof input.expected !== "string" || typeof input.replacement !== "string") {
    throw new Error("CODE_AI_REPLACE_RANGE_TEXT_REQUIRED");
  }

  let result;
  if (typeof workspace.replaceRange === "function") {
    const nativeResult = await workspace.replaceRange({
      file_path: filePath,
      start_line: startLine,
      end_line: endLine,
      expected,
      replacement,
    });
    result = { ...object(nativeResult) };
    recordRangeSourceChange(state, {
      path: filePath,
      start_line: startLine,
      end_line: endLine,
      expected,
      replacement,
    });
    if (!result.valid) {
      const scoped = await refreshSourceChanges(workspace, state);
      if (Number(scoped.diff?.diff_check?.exit_code || 0) !== 0) {
        throw Object.assign(new Error("CODE_AI_DIFF_CHECK_FAILED_AFTER_RANGE_EDIT"), {
          details: { ...object(result), mission_scoped_diff_check: scoped.diff.diff_check },
        });
      }
    }
    state.files_changed = [...new Set([...state.files_changed, filePath])];
    appendRepair(state, operation, [filePath], {
      mutation_contract: "AVANTIQO_CODE_WORKSPACE_REPLACE_RANGE_V1",
      mutations: ["replace_range"],
    });
  } else {
    const current = await workspace.read({
      file_path: filePath,
      start_line: 1,
      end_line: 1000000,
    });
    const lines = String(current?.content ?? "").split("\n");
    if (endLine > lines.length) {
      throw new Error("CODE_AI_REPLACE_RANGE_OUT_OF_BOUNDS");
    }
    const observed = lines.slice(startLine - 1, endLine).join("\n");
    if (observed !== expected) {
      const error = new Error("CODE_AI_REPLACE_RANGE_STALE_SOURCE");
      error.details = {
        file_path: filePath,
        start_line: startLine,
        end_line: endLine,
        expected_sha256: crypto.createHash("sha256").update(expected, "utf8").digest("hex"),
        observed_sha256: crypto.createHash("sha256").update(observed, "utf8").digest("hex"),
        raw_source_persisted: false,
      };
      throw error;
    }
    const replacementLines = replacement === "" ? [] : replacement.split("\n");
    const nextContent = [
      ...lines.slice(0, startLine - 1),
      ...replacementLines,
      ...lines.slice(endLine),
    ].join("\n");

    result = await executeExtendedApplyFiles(
      workspace,
      {
        ...operation,
        input: {
          files: [{ path: filePath, content: nextContent }],
        },
      },
      state,
    );
  }
  addEvidence(state, {
    kind: "source_bound_range_mutation",
    operation_id: operation.id,
    file_path: filePath,
    start_line: startLine,
    end_line: endLine,
    expected_sha256: crypto.createHash("sha256").update(expected, "utf8").digest("hex"),
    replacement_sha256: crypto.createHash("sha256").update(replacement, "utf8").digest("hex"),
    controller_full_file_reconstruction: true,
    raw_full_file_persisted: false,
    authorization_effect: "NONE",
  });
  return {
    ...result,
    contract: "AVANTIQO_CODE_REPLACE_RANGE_V1",
    file_path: filePath,
    start_line: startLine,
    end_line: endLine,
    controller_full_file_reconstruction: true,
  };
}

async function executeOperation(workspace, operation, state, controlContext = null) {
  switch (operation.action) {
    case "inspect": {
      const inspection = await inspectCodeRepositoryIntelligence(workspace, {
        on_progress: (event) => publishCodeAILiveProgress({
          context: controlContext || {},
          state,
          event: {
            ...object(event),
            mission_id: state.mission_id,
            operation_id: operation.id,
            files_changed: list(state.files_changed),
          },
        }),
      });
      const guidance = plannerRepositoryGuidance(inspection);
      state.repository_guidance = guidance;
      appendRepositoryGuidanceEvidence(state);
      return {
        ...inspection,
        code_planner_capabilities: autonomousPlannerCapabilities(),
        code_planner_repository_guidance: guidance,
      };
    }
    case "search":
      return workspace.search(operation.input);
    case "read": {
      const virtualEvidence = virtualRepositoryGuidanceRead(operation, state);
      if (virtualEvidence) {
        addEvidence(state, {
          kind: "virtual_repository_guidance_read",
          operation_id: operation.id,
          evidence_field: virtualEvidence.evidence_field || null,
          requested_path: virtualEvidence.requested_path,
          authorization_effect: "NONE",
        });
        return virtualEvidence;
      }
      try {
        return await workspace.read(operation.input);
      } catch (error) {
        if (!missingRepositoryReadPath(operation, error)) throw error;
        return recoverMissingRepositoryRead(workspace, operation, state, controlContext, error);
      }
    }
    case "apply_files":
      return executeExtendedApplyFiles(workspace, operation, state);
    case "replace_range":
      return executeReplaceRange(workspace, operation, state);
    case "delete_files": {
      const paths = list(operation.input.paths);
      assertMutationPathsWithinAllowedEditScope(state, paths);
      const result = await deleteCodeWorkspaceFiles(workspace, paths);
      if (!result.valid) throw Object.assign(new Error("CODE_AI_DIFF_CHECK_FAILED_AFTER_DELETE"), { details: result });
      const deleted = result.deleted.map((item) => item.path);
      recordSourceDeletes(state, deleted);
      state.files_changed = [...new Set([...state.files_changed, ...deleted])];
      appendRepair(state, operation, deleted, { mutation: "delete" });
      return result;
    }
    case "rename_files": {
      const renames = list(operation.input.renames);
      assertMutationPathsWithinAllowedEditScope(
        state,
        renames.flatMap((item) => [item?.from_path, item?.to_path]),
      );
      const result = await renameCodeWorkspaceFiles(workspace, renames);
      if (!result.valid) throw Object.assign(new Error("CODE_AI_DIFF_CHECK_FAILED_AFTER_RENAME"), { details: result });
      recordSourceRenames(state, result.renamed);
      const changed = result.renamed.flatMap((item) => [item.from_path, item.to_path]);
      state.files_changed = [...new Set([...state.files_changed, ...changed])];
      appendRepair(state, operation, changed, {
        mutation: "rename",
        renames: result.renamed.map((item) => ({
          from_path: item.from_path,
          to_path: item.to_path,
        })),
      });
      return result;
    }
    case "record_reproduction": {
      const declaredStatus = normalizeReproductionStatus(operation.input?.status);
      let status = declaredStatus;
      let evidenceOperationIds = list(operation.input?.evidence_operation_ids)
        .map((item) => text(item, 240))
        .filter(Boolean)
        .slice(0, 12);
      const testFile = text(operation.input?.test_file || operation.input?.testFile, 1000);
      const observedEvidenceStatus = deriveReproductionStatusFromEvidence(state, evidenceOperationIds);
      if (
        observedEvidenceStatus &&
        ["FAILED", "PASSED"].includes(declaredStatus) &&
        declaredStatus !== observedEvidenceStatus
      ) {
        throw new Error(`CODE_AI_REPRODUCTION_STATUS_EVIDENCE_MISMATCH:${declaredStatus}:${observedEvidenceStatus}`);
      }
      if (observedEvidenceStatus) status = observedEvidenceStatus;
      if (!observedEvidenceStatus && evidenceOperationIds.length && ["FAILED", "PASSED"].includes(declaredStatus)) {
        throw new Error("CODE_AI_REPRODUCTION_EVIDENCE_NOT_VERIFIABLE");
      }
      if (!observedEvidenceStatus && !evidenceOperationIds.length && ["FAILED", "PASSED"].includes(declaredStatus) && !testFile) {
        throw new Error("CODE_AI_REPRODUCTION_EVIDENCE_REQUIRED");
      }
      if (!observedEvidenceStatus && testFile && declaredStatus !== "NOT_REPRODUCIBLE") {
        const observedRun = await runWithoutSourceMutation(workspace, {
          command: "node",
          args: ["--test", testFile],
          cwd: text(operation.input?.cwd || operation.input?.working_directory) || ".",
        });
        const evidenceOperationId = `${operation.id}_observed_test`;
        status = Number(observedRun?.exit_code) === 0 ? "PASSED" : "FAILED";
        if (["FAILED", "PASSED"].includes(declaredStatus) && declaredStatus !== status) {
          throw new Error(`CODE_AI_REPRODUCTION_STATUS_EVIDENCE_MISMATCH:${declaredStatus}:${status}`);
        }
        evidenceOperationIds = [...new Set([...evidenceOperationIds, evidenceOperationId])].slice(0, 12);
        state.tests = [...state.tests, {
          at: now(),
          operation_id: evidenceOperationId,
          command: observedRun.command,
          args: observedRun.args,
          exit_code: observedRun.exit_code,
          stdout: observedRun.stdout,
          stderr: observedRun.stderr,
        }].slice(-40);
        state.verification = [...state.verification, {
          at: now(),
          operation_id: evidenceOperationId,
          passed: Number(observedRun?.exit_code) === 0,
        }].slice(-40);
        addEvidence(state, {
          kind: "operation",
          operation_id: evidenceOperationId,
          action: "verify",
          description: "Observed reproduction test derived from planner test_file evidence.",
          status: "completed",
          result: observedRun,
        });
      }
      if (!["FAILED", "PASSED", "NOT_REPRODUCIBLE"].includes(status)) {
        throw new Error("CODE_AI_REPRODUCTION_STATUS_INVALID");
      }
      const sameReproductionKey = text(operation.input?.same_reproduction_key).slice(0, 240) || null;
      if (["FAILED", "PASSED"].includes(status) && !sameReproductionKey) {
        throw new Error("CODE_AI_REPRODUCTION_SAME_KEY_REQUIRED");
      }
      const priorRecords = list(state.reproduction?.records);
      const matchingFailureObserved = status === "PASSED" && priorRecords.some((entry) =>
        entry?.status === "FAILED" &&
        text(entry?.same_reproduction_key, 240) === sameReproductionKey
      );
      if (status === "PASSED" && !matchingFailureObserved) {
        throw new Error(`CODE_AI_REPRODUCTION_MATCHING_FAILURE_REQUIRED:${sameReproductionKey}`);
      }
      const record = {
        contract: "AVANTIQO_CODE_REPRODUCTION_EVIDENCE_V1",
        at: now(),
        status,
        summary: boundedString(operation.input?.summary, 3000),
        evidence_operation_ids: evidenceOperationIds,
        same_reproduction_key: sameReproductionKey,
        source_revision: Math.max(
          0,
          Number(state?.autonomy_control?.source_revision || 0),
        ),
      };
      state.reproduction = {
        ...object(state.reproduction),
        records: [...priorRecords, record].slice(-12),
        latest_status: status,
        before_failure_observed: state.reproduction?.before_failure_observed === true || status === "FAILED",
        after_pass_observed: state.reproduction?.after_pass_observed === true || matchingFailureObserved,
        exact_before_after_observed: state.reproduction?.exact_before_after_observed === true || matchingFailureObserved,
        exact_reproduction_key: matchingFailureObserved
          ? sameReproductionKey
          : state.reproduction?.exact_reproduction_key || null,
      };
      return record;
    }
    case "record_hypotheses": {
      const hypotheses = list(operation.input?.hypotheses).slice(0, 8).map((entry, index) => {
        const source = object(entry);
        const status = text(source.status).toUpperCase() || "PLAUSIBLE";
        if (!["PLAUSIBLE", "ELIMINATED", "SUPPORTED"].includes(status)) {
          throw new Error(`CODE_AI_HYPOTHESIS_STATUS_INVALID:${status}`);
        }
        const evidenceOperationIds = list(source.evidence_operation_ids)
          .map((item) => text(item, 240))
          .filter(Boolean)
          .slice(0, 12);
        if (["ELIMINATED", "SUPPORTED"].includes(status)) {
          assertObservedEvidenceOperationIds(
            state,
            evidenceOperationIds,
            "CODE_AI_HYPOTHESIS",
          );
        }
        return {
          id: text(source.id).slice(0, 120) || `H${index + 1}`,
          hypothesis: boundedString(source.hypothesis || source.causal_path, 1500),
          status,
          evidence_operation_ids: evidenceOperationIds,
        };
      }).filter((entry) => entry.hypothesis);
      if (!hypotheses.length) throw new Error("CODE_AI_HYPOTHESES_REQUIRED");
      state.hypothesis_debugging = {
        contract: "AVANTIQO_CODE_HYPOTHESIS_DEBUGGING_V1",
        hypotheses,
        falsification_first: true,
        source_revision: Math.max(0, Number(state?.autonomy_control?.source_revision || 0)),
        updated_at: now(),
      };
      addEvidence(state, { kind: "causal_hypothesis_record", hypotheses });
      return state.hypothesis_debugging;
    }
    case "record_database_review": {
      const evidenceOperationIds = assertObservedEvidenceOperationIds(
        state,
        operation.input?.evidence_operation_ids,
        "CODE_AI_DATABASE_REVIEW",
      );
      const record = {
        contract: "AVANTIQO_CODE_DATABASE_ENGINEERING_REVIEW_V1",
        at: now(),
        passed: operation.input?.passed === true,
        migration_plan: boundedString(operation.input?.migration_plan, 3000),
        backward_compatibility: boundedString(operation.input?.backward_compatibility, 3000),
        rls_review: boundedString(operation.input?.rls_review, 3000),
        rollback_plan: boundedString(operation.input?.rollback_plan, 3000),
        evidence_operation_ids: evidenceOperationIds.slice(0, 16),
      };
      if (!record.migration_plan || !record.backward_compatibility || !record.rollback_plan) throw new Error("CODE_AI_DATABASE_REVIEW_INCOMPLETE");
      state.database_review = record;
      addEvidence(state, { kind: "database_engineering_review", ...record });
      return record;
    }
    case "record_security_review": {
      const findings = list(operation.input?.findings).map((item) => boundedString(item, 1200)).filter(Boolean).slice(0, 20);
      const evidenceOperationIds = assertObservedEvidenceOperationIds(
        state,
        operation.input?.evidence_operation_ids,
        "CODE_AI_SECURITY_REVIEW",
      );
      const record = {
        contract: "AVANTIQO_CODE_SECURITY_ENGINEERING_REVIEW_V1",
        at: now(),
        passed: operation.input?.passed === true,
        scope: boundedString(operation.input?.scope, 2500),
        findings,
        evidence_operation_ids: evidenceOperationIds.slice(0, 16),
        independent_veto: true,
      };
      if (!record.scope) throw new Error("CODE_AI_SECURITY_REVIEW_SCOPE_REQUIRED");
      state.security_review = record;
      addEvidence(state, { kind: "security_engineering_review", ...record });
      return record;
    }
    case "record_performance_evidence": {
      const before = Number(operation.input?.before);
      const after = Number(operation.input?.after);
      if (!Number.isFinite(before) || !Number.isFinite(after)) throw new Error("CODE_AI_PERFORMANCE_BEFORE_AFTER_REQUIRED");
      const evidenceOperationIds = assertObservedEvidenceOperationIds(
        state,
        operation.input?.evidence_operation_ids,
        "CODE_AI_PERFORMANCE",
        { requireSuccessful: true },
      );
      const benchmarkKey = text(operation.input?.benchmark_key, 240);
      const beforeOperationId = text(operation.input?.before_operation_id, 240);
      const afterOperationId = text(operation.input?.after_operation_id, 240);
      if (!benchmarkKey) throw new Error("CODE_AI_PERFORMANCE_BENCHMARK_KEY_REQUIRED");
      if (!beforeOperationId || !afterOperationId || beforeOperationId === afterOperationId) {
        throw new Error("CODE_AI_PERFORMANCE_DISTINCT_BEFORE_AFTER_OPERATIONS_REQUIRED");
      }
      if (!evidenceOperationIds.includes(beforeOperationId) || !evidenceOperationIds.includes(afterOperationId)) {
        throw new Error("CODE_AI_PERFORMANCE_BEFORE_AFTER_EVIDENCE_MISMATCH");
      }
      const direction = text(operation.input?.direction, 80).toLowerCase();
      if (!["lower_is_better", "higher_is_better"].includes(direction)) {
        throw new Error("CODE_AI_PERFORMANCE_DIRECTION_REQUIRED");
      }
      const minimumImprovementPercent = Math.max(
        0,
        Math.min(100, Number(operation.input?.minimum_improvement_percent ?? 0)),
      );
      if (!Number.isFinite(minimumImprovementPercent)) {
        throw new Error("CODE_AI_PERFORMANCE_IMPROVEMENT_THRESHOLD_INVALID");
      }
      const improvementPercent = before === 0
        ? (after === 0 ? 0 : (direction === "higher_is_better" ? Infinity : -Infinity))
        : direction === "lower_is_better"
          ? ((before - after) / Math.abs(before)) * 100
          : ((after - before) / Math.abs(before)) * 100;
      const measuredPassed =
        Number.isFinite(improvementPercent) &&
        improvementPercent >= minimumImprovementPercent &&
        (
          direction === "lower_is_better"
            ? after < before
            : after > before
        );
      if (operation.input?.passed === true && !measuredPassed) {
        throw new Error("CODE_AI_PERFORMANCE_CLAIM_NOT_SUPPORTED_BY_MEASUREMENTS");
      }
      const record = {
        contract: "AVANTIQO_CODE_PERFORMANCE_EVIDENCE_V1",
        at: now(),
        passed: operation.input?.passed === true && measuredPassed,
        benchmark_key: benchmarkKey,
        metric: text(operation.input?.metric).slice(0, 240),
        direction,
        minimum_improvement_percent: minimumImprovementPercent,
        measured_improvement_percent: Number.isFinite(improvementPercent)
          ? Math.round(improvementPercent * 1000) / 1000
          : null,
        before, after,
        before_operation_id: beforeOperationId,
        after_operation_id: afterOperationId,
        unit: text(operation.input?.unit).slice(0, 80) || null,
        evidence_operation_ids: evidenceOperationIds.slice(0, 16),
      };
      if (!record.metric) throw new Error("CODE_AI_PERFORMANCE_METRIC_REQUIRED");
      state.performance_evidence = record;
      addEvidence(state, { kind: "performance_evidence", ...record });
      return record;
    }
    case "record_observability_evidence": {
      const evidenceOperationIds = assertObservedEvidenceOperationIds(
        state,
        operation.input?.evidence_operation_ids,
        "CODE_AI_OBSERVABILITY",
      );
      const record = {
        contract: "AVANTIQO_CODE_OBSERVABILITY_EVIDENCE_V1",
        at: now(),
        source: text(operation.input?.source).slice(0, 240),
        summary: boundedString(operation.input?.summary, 4000),
        evidence_operation_ids: evidenceOperationIds.slice(0, 16),
      };
      if (!record.source || !record.summary) throw new Error("CODE_AI_OBSERVABILITY_EVIDENCE_INCOMPLETE");
      state.observability_evidence = {
        contract: record.contract,
        records: [...list(state.observability_evidence?.records), record].slice(-20),
      };
      addEvidence(state, { kind: "observability_evidence", ...record });
      return record;
    }
    case "record_precision_evidence": {
      const key = text(operation.input?.key).toLowerCase();
      const allowed = new Set([
        "compiler_semantics", "incremental_semantic_index", "test_impact", "coverage_guidance",
        "mutation_testing", "property_fuzz", "git_history", "regression_archaeology",
        "flaky_intelligence", "environment_fingerprint", "supply_chain", "taint_dataflow",
        "patch_minimization", "uncertainty", "tool_cache", "context_compiler",
        "context_compression", "watchdog", "failure_injection", "concurrency_lab",
        "staging_canary", "progressive_rollback", "business_invariants", "shadow_verification",
        "user_flow_replay", "visual_regression", "accessibility", "review_comments",
        "reviewer_calibration", "self_improvement_benchmark", "local_specialization",
        "repository_specialist", "throughput_scheduler", "compute_economics", "comparative_benchmark",
      ]);
      if (!allowed.has(key)) throw new Error("CODE_AI_PRECISION_EVIDENCE_KEY_INVALID");
      const evidenceOperationIds = list(operation.input?.evidence_operation_ids).map((item) => text(item)).filter(Boolean).slice(0, 24);
      if (!evidenceOperationIds.length) throw new Error("CODE_AI_PRECISION_EVIDENCE_OPERATION_REQUIRED");
      const observedOperations = new Map(
        list(state.evidence)
          .filter((entry) => entry?.kind === "operation" && text(entry?.operation_id))
          .map((entry) => [text(entry.operation_id), entry]),
      );
      const missingOperations = evidenceOperationIds.filter((id) => !observedOperations.has(id));
      if (missingOperations.length) throw new Error(`CODE_AI_PRECISION_EVIDENCE_OPERATION_NOT_OBSERVED:${missingOperations.join(",")}`);
      const failedOperations = evidenceOperationIds.filter((id) => {
        const entry = observedOperations.get(id);
        if (text(entry?.status, 80) !== "completed") return true;
        const result = object(entry?.result);
        if (Number.isFinite(Number(result.exit_code)) && Number(result.exit_code) !== 0) return true;
        if (result.passed === false) return true;
        return false;
      });
      if (failedOperations.length) throw new Error(`CODE_AI_PRECISION_EVIDENCE_OPERATION_FAILED:${failedOperations.join(",")}`);
      const record = {
        contract: "AVANTIQO_CODE_PRECISION_EVIDENCE_V1",
        key,
        at: now(),
        recorded: true,
        passed: operation.input?.passed === true,
        verified: operation.input?.verified === true,
        summary: boundedString(operation.input?.summary, 5000),
        metrics: bounded(object(operation.input?.metrics)),
        evidence_operation_ids: evidenceOperationIds,
        evidence_refs: list(operation.input?.evidence_refs).map((item) => boundedString(item, 1200)).filter(Boolean).slice(0, 24),
        authority_effect: "NONE",
      };
      if (!record.summary) throw new Error("CODE_AI_PRECISION_EVIDENCE_SUMMARY_REQUIRED");
      state.precision_evidence = { ...object(state.precision_evidence), [key]: record };
      addEvidence(state, { kind: "precision_evidence", ...record });
      return record;
    }
    case "history": {
      const filePath = text(operation.input?.file_path);
      if (!filePath || filePath.startsWith("/") || filePath.includes("..")) throw new Error("CODE_AI_HISTORY_FILE_PATH_INVALID");
      const line = Number(operation.input?.line || 1);
      const limit = Math.max(1, Math.min(30, Number(operation.input?.limit || 12)));
      const log = await runWithoutSourceMutation(workspace, { command: "git", args: ["log", `-${limit}`, "--format=%H%x09%ad%x09%s", "--date=iso-strict", "--", filePath], cwd: ".", timeout_ms: operation.input?.timeout_ms });
      const blame = await runWithoutSourceMutation(workspace, { command: "git", args: ["blame", "--porcelain", `-L${Math.max(1,line)},${Math.max(1,line)}`, "--", filePath], cwd: ".", timeout_ms: operation.input?.timeout_ms });
      const result = {
        contract: "AVANTIQO_CODE_GIT_HISTORY_EVIDENCE_V1",
        file_path: filePath,
        line: Math.max(1,line),
        log: boundedString(log.stdout, 12000),
        blame: boundedString(blame.stdout, 8000),
        log_exit_code: log.exit_code,
        blame_exit_code: blame.exit_code,
        read_only: true,
      };
      if (log.exit_code !== 0 || blame.exit_code !== 0) throw Object.assign(new Error("CODE_AI_HISTORY_INSPECTION_FAILED"), { details: result });
      state.precision_evidence = {
        ...object(state.precision_evidence),
        git_history: { contract: result.contract, recorded: true, passed: true, verified: true, file_path: filePath, line: result.line },
        regression_archaeology: { contract: "AVANTIQO_CODE_REGRESSION_ARCHAEOLOGY_V1", recorded: true, passed: true, verified: true, file_path: filePath, line: result.line },
      };
      addEvidence(state, { kind: "git_history", ...result });
      return result;
    }
    case "precision_analyze": {
      const {
        buildCodeAISemanticFileIndex,
        deriveCodeAICoverageObligations,
        generateCodeAIMutants,
        generateCodeAIFuzzCases,
        scanCodeAISupplyChain,
        deriveCodeAITaintSignals,
        calibrateCodeAIUncertainty,
        deriveCodeAIFailureInjectionPlan,
        deriveCodeAIConcurrencyPlan,
        deriveCodeAIBusinessInvariantSuite,
        deriveCodeAIReviewComments,
        deriveCodeAIReviewCalibration,
        deriveCodeAISelfImprovementDecision,
        deriveCodeAIComputeEconomics,
        deriveCodeAIComparativeBenchmark,
      } = await loadEngineeringPrecisionRuntime();
      const explicitKind = text(operation.input?.kind).toLowerCase();
      const supportedPrecisionKinds = new Set([
        "compiler_semantics",
        "mutation_testing",
        "supply_chain",
        "taint_dataflow",
        "coverage_guidance",
        "property_fuzz",
        "uncertainty",
        "failure_injection",
        "concurrency_lab",
        "business_invariants",
        "review_comments",
        "reviewer_calibration",
        "self_improvement_benchmark",
        "compute_economics",
        "comparative_benchmark",
      ]);
      const normalizedExplicitKind = !explicitKind
        ? ""
        : supportedPrecisionKinds.has(explicitKind)
          ? explicitKind
          : /restart|recovery|resilien|failure|timeout|disconnect|unavailable|outage/.test(explicitKind)
            ? "failure_injection"
            : /coverage/.test(explicitKind)
              ? "coverage_guidance"
              : /fuzz|property/.test(explicitKind)
                ? "property_fuzz"
                : /concurr|race|duplicate/.test(explicitKind)
                  ? "concurrency_lab"
                  : /business|invariant/.test(explicitKind)
                    ? "business_invariants"
                    : /review|finding/.test(explicitKind)
                      ? "review_comments"
                      : /benchmark|compar/.test(explicitKind)
                        ? "comparative_benchmark"
                        : /uncertain|confidence|evidence|verification|verify|analysis|check/.test(explicitKind)
                          ? "uncertainty"
                          : explicitKind.includes(" ")
                            ? "uncertainty"
                            : explicitKind;
      const inferredKind = normalizedExplicitKind || (
        operation.input?.coverage || list(operation.input?.changed_lines).length
          ? "coverage_guidance"
          : operation.input?.schema
            ? "property_fuzz"
            : list(operation.input?.facts).length || list(operation.input?.hypotheses).length || list(operation.input?.contradictions).length
              ? "uncertainty"
              : list(operation.input?.surfaces).length
                ? "failure_injection"
                : list(operation.input?.operations).length
                  ? "concurrency_lab"
                  : operation.input?.domain || list(operation.input?.entities).length
                    ? "business_invariants"
                    : list(operation.input?.findings).length
                      ? "review_comments"
                      : list(operation.input?.reviews).length
                        ? "reviewer_calibration"
                        : operation.input?.baseline || operation.input?.candidate
                          ? "self_improvement_benchmark"
                          : operation.input?.metrics
                            ? "compute_economics"
                            : operation.input?.avantiqo || operation.input?.competitor
                              ? "comparative_benchmark"
                              : text(operation.input?.file_path)
                                ? "compiler_semantics"
                                : "uncertainty"
      );
      const kind = inferredKind;
      let analysis = null;
      if (["compiler_semantics", "mutation_testing", "supply_chain", "taint_dataflow"].includes(kind)) {
        const filePath = text(operation.input?.file_path);
        if (!filePath) throw new Error("CODE_AI_PRECISION_ANALYZE_FILE_REQUIRED");
        const read = await workspace.read({ file_path: filePath, start_line: 1, end_line: 1000000 });
        if (kind === "compiler_semantics") analysis = buildCodeAISemanticFileIndex({ filePath, content: read.content });
        else if (kind === "mutation_testing") analysis = generateCodeAIMutants({ filePath, content: read.content, limit: operation.input?.limit || 12 });
        else if (kind === "taint_dataflow") analysis = deriveCodeAITaintSignals({ filePath, content: read.content });
        else {
          const lockfile = /package-lock\.json$/i.test(filePath) ? read.content : "";
          analysis = scanCodeAISupplyChain({ lockfile, sourceFiles: [{ path: filePath, content: read.content }] });
        }
      } else if (kind === "coverage_guidance") analysis = deriveCodeAICoverageObligations({ changedLines: list(operation.input?.changed_lines), coverage: object(operation.input?.coverage) });
      else if (kind === "property_fuzz") analysis = generateCodeAIFuzzCases({ schema: object(operation.input?.schema), limit: operation.input?.limit || 40 });
      else if (kind === "uncertainty") analysis = calibrateCodeAIUncertainty({ facts: list(operation.input?.facts), hypotheses: list(operation.input?.hypotheses), contradictions: list(operation.input?.contradictions) });
      else if (kind === "failure_injection") analysis = deriveCodeAIFailureInjectionPlan({ surfaces: list(operation.input?.surfaces) });
      else if (kind === "concurrency_lab") analysis = deriveCodeAIConcurrencyPlan({ operations: list(operation.input?.operations) });
      else if (kind === "business_invariants") analysis = deriveCodeAIBusinessInvariantSuite({ domain: operation.input?.domain, entities: list(operation.input?.entities) });
      else if (kind === "review_comments") analysis = deriveCodeAIReviewComments({ findings: list(operation.input?.findings) });
      else if (kind === "reviewer_calibration") analysis = deriveCodeAIReviewCalibration({ reviews: list(operation.input?.reviews) });
      else if (kind === "self_improvement_benchmark") analysis = deriveCodeAISelfImprovementDecision({ baseline: object(operation.input?.baseline), candidate: object(operation.input?.candidate) });
      else if (kind === "compute_economics") analysis = deriveCodeAIComputeEconomics(object(operation.input?.metrics));
      else if (kind === "comparative_benchmark") analysis = deriveCodeAIComparativeBenchmark({ avantiqo: object(operation.input?.avantiqo), competitor: object(operation.input?.competitor) });
      else throw new Error(`CODE_AI_PRECISION_ANALYZE_KIND_UNSUPPORTED:${kind}`);
      const passed = analysis?.passed !== false && analysis?.complete !== false && analysis?.verified !== false;
      state.precision_evidence = { ...object(state.precision_evidence), [kind]: { contract: text(analysis?.contract, 180) || "AVANTIQO_CODE_PRECISION_ANALYSIS_V1", recorded: true, passed, verified: true, analysis } };
      addEvidence(state, { kind: "precision_analysis", precision_key: kind, operation_id: operation.id, passed, result: analysis });
      return analysis;
    }
    case "mutation_test": {
      const { generateCodeAIMutants } = await loadEngineeringPrecisionRuntime();
      const filePath = text(operation.input?.file_path);
      const command = text(operation.input?.command);
      const args = list(operation.input?.args).map(String);
      if (!filePath || !command) throw new Error("CODE_AI_MUTATION_TEST_INPUT_REQUIRED");
      const original = await workspace.read({ file_path: filePath, start_line: 1, end_line: 1000000 });
      const plan = generateCodeAIMutants({ filePath, content: original.content, limit: Math.max(1, Math.min(6, Number(operation.input?.limit || 3))) });
      if (!plan.mutants.length) throw new Error("CODE_AI_MUTATION_TEST_NO_MUTANTS_GENERATED");
      const before = await workspace.diff();
      const outcomes = [];
      try {
        for (const mutant of plan.mutants) {
          const applied = await workspace.applyFiles([{ path: filePath, content: mutant.content }]);
          if (!applied?.valid) throw new Error("CODE_AI_MUTATION_TEST_MUTANT_DIFF_INVALID");
          const testResult = await runWithoutSourceMutation(workspace, { command, args, cwd: operation.input?.cwd || ".", timeout_ms: operation.input?.timeout_ms });
          outcomes.push({ id: mutant.id, kind: mutant.kind, killed: Number(testResult.exit_code) !== 0, exit_code: Number(testResult.exit_code), stdout: boundedString(testResult.stdout, 2500), stderr: boundedString(testResult.stderr, 2500) });
        }
      } finally {
        await workspace.applyFiles([{ path: filePath, content: original.content }]);
      }
      const after = await workspace.diff();
      if (after.patch !== before.patch) throw new Error("CODE_AI_MUTATION_TEST_RESTORE_FAILED");
      const survived = outcomes.filter((item) => !item.killed);
      state.precision_evidence = { ...object(state.precision_evidence), mutation_testing: { contract: "AVANTIQO_CODE_MUTATION_TEST_V1", recorded: true, passed: survived.length === 0, verified: true, evidence_operation_ids: [operation.id], mutant_count: outcomes.length, killed_count: outcomes.length - survived.length, survived_count: survived.length } };
      const result = { contract: "AVANTIQO_CODE_MUTATION_TEST_V1", file_path: filePath, outcomes, survived, passed: survived.length === 0, candidate_source_restored: true };
      if (survived.length) throw Object.assign(new Error(`CODE_AI_MUTATION_TEST_SURVIVED:${survived.map((item) => item.id).join(",")}`), { details: result });
      return result;
    }
    case "coverage_test": {
      const testArgs = list(operation.input?.args).map(String);
      if (!testArgs.length) throw new Error("CODE_AI_COVERAGE_TEST_ARGS_REQUIRED");
      const result = await runWithoutSourceMutation(workspace, { command: "node", args: ["--experimental-test-coverage", ...testArgs], cwd: operation.input?.cwd || ".", timeout_ms: operation.input?.timeout_ms });
      const output = `${result.stdout || ""}\n${result.stderr || ""}`;
      const match = output.match(/all files\s*\|\s*([0-9.]+)\s*\|\s*([0-9.]+)\s*\|\s*([0-9.]+)/i);
      if (result.exit_code !== 0 || !match) throw Object.assign(new Error("CODE_AI_COVERAGE_TEST_FAILED"), { details: result });
      const metrics = { line_percent: Number(match[1]), branch_percent: Number(match[2]), function_percent: Number(match[3]) };
      const minimumLine = Number(operation.input?.minimum_line_percent ?? 0);
      const minimumBranch = Number(operation.input?.minimum_branch_percent ?? 0);
      const passed = metrics.line_percent >= minimumLine && metrics.branch_percent >= minimumBranch;
      state.precision_evidence = { ...object(state.precision_evidence), coverage_guidance: { contract: "AVANTIQO_CODE_COVERAGE_TEST_V1", recorded: true, passed, verified: true, evidence_operation_ids: [operation.id], metrics } };
      const payload = { contract: "AVANTIQO_CODE_COVERAGE_TEST_V1", passed, metrics, minimum_line_percent: minimumLine, minimum_branch_percent: minimumBranch };
      if (!passed) throw Object.assign(new Error("CODE_AI_COVERAGE_THRESHOLD_NOT_MET"), { details: payload });
      return payload;
    }
    case "fuzz_test": {
      const { generateCodeAIFuzzCases } = await loadEngineeringPrecisionRuntime();
      const command = text(operation.input?.command);
      const prefix = list(operation.input?.args_prefix).map(String);
      const generated = generateCodeAIFuzzCases({ schema: object(operation.input?.schema), limit: Math.max(2, Math.min(40, Number(operation.input?.limit || 20))) });
      if (!command) throw new Error("CODE_AI_FUZZ_TEST_COMMAND_REQUIRED");
      const outcomes = [];
      for (const testCase of generated.cases) {
        const result = await runWithoutSourceMutation(workspace, { command, args: [...prefix, JSON.stringify(testCase.input)], cwd: operation.input?.cwd || ".", timeout_ms: operation.input?.timeout_ms });
        outcomes.push({ id: testCase.id, kind: testCase.kind, passed: result.exit_code === 0, exit_code: result.exit_code, stderr: boundedString(result.stderr, 1800) });
        if (outcomes.length >= generated.case_count) break;
      }
      const failed = outcomes.filter((item) => !item.passed);
      state.precision_evidence = { ...object(state.precision_evidence), property_fuzz: { contract: "AVANTIQO_CODE_FUZZ_TEST_V1", recorded: true, passed: failed.length === 0, verified: true, evidence_operation_ids: [operation.id], case_count: outcomes.length, failed_count: failed.length } };
      const payload = { contract: "AVANTIQO_CODE_FUZZ_TEST_V1", passed: failed.length === 0, outcomes, failed };
      if (failed.length) throw Object.assign(new Error(`CODE_AI_FUZZ_TEST_FAILED:${failed[0].id}`), { details: payload });
      return payload;
    }
    case "run": {
      const result = await runWithoutSourceMutation(workspace, operation.input);
      if (result.exit_code !== 0) {
        const error = new Error(`CODE_AI_COMMAND_FAILED:${result.command}:${result.exit_code}`);
        error.details = result;
        throw error;
      }
      return result;
    }
    case "verify": {
      const result = await runWithoutSourceMutation(workspace, operation.input);
      const verifierEnv = normalizeCodeAIVerifierEnvironment(operation.input?.env);
      state.tests = [...state.tests, {
        at: now(),
        operation_id: operation.id,
        command: result.command,
        args: result.args,
        env: verifierEnv,
        exit_code: result.exit_code,
        stdout: result.stdout,
        stderr: result.stderr,
      }].slice(-40);
      state.verification = [...state.verification, {
        at: now(),
        operation_id: operation.id,
        command: result.command,
        args: result.args,
        env: verifierEnv,
        exit_code: result.exit_code,
        passed: result.exit_code === 0,
      }].slice(-40);
      if (result.exit_code !== 0) {
        const error = new Error(`CODE_AI_VERIFICATION_FAILED:${result.command}:${result.exit_code}`);
        error.details = result;
        throw error;
      }
      return result;
    }
    case "browser_verify": {
      if (typeof workspace.browserVerify !== "function") {
        throw new Error("CODE_AI_BROWSER_VERIFICATION_REQUIRES_CONNECTED_DEVICE");
      }
      const beforeBrowserDiff = await workspace.diff();
      const browserPatchSha256 = crypto
        .createHash("sha256")
        .update(String(beforeBrowserDiff?.patch ?? ""), "utf8")
        .digest("hex");
      const result = await workspace.browserVerify(operation.input);
      const afterBrowserDiff = await workspace.diff();
      if (String(afterBrowserDiff?.patch ?? "") !== String(beforeBrowserDiff?.patch ?? "")) {
        throw new Error("CODE_AI_BROWSER_VERIFICATION_MUTATED_SOURCE");
      }
      const passed = result?.passed === true;
      const browserObservedAt = now();
      state.tests = [...state.tests, {
        at: browserObservedAt,
        operation_id: operation.id,
        command: "browser.verify",
        args: [text(operation.input?.url)].filter(Boolean),
        exit_code: passed ? 0 : 1,
        stdout: boundedString(JSON.stringify({
          url: result?.url || null,
          title: result?.title || null,
          http_status: result?.http_status ?? null,
          screenshot_path: result?.screenshot_path || null,
        }), 5000),
        stderr: passed ? "" : boundedString(JSON.stringify({
          console_errors: result?.console_errors || [],
          page_errors: result?.page_errors || [],
          failed_requests: result?.failed_requests || [],
        }), 5000),
      }].slice(-40);
      state.verification = [...state.verification, {
        at: browserObservedAt,
        operation_id: operation.id,
        passed,
        family: "browser",
        browser_url: result?.url || operation.input?.url || null,
        screenshot_path: result?.screenshot_path || null,
      }].slice(-40);
      if (passed) {
        state.runtime_evidence = [...list(state.runtime_evidence), {
          at: browserObservedAt,
          kind: "browser_verify",
          source: "CODE_AI_BROWSER_VERIFY_OPERATION",
          operation_id: operation.id,
          patch_sha256: browserPatchSha256,
          verified: true,
          passed: true,
          browser_url: result?.url || operation.input?.url || null,
          screenshot_path: result?.screenshot_path || null,
          workspace_patch_verified: true,
          provider_call_performed: false,
          model_call_performed: false,
          authorization_effect: "NONE",
        }].slice(-60);
      }
      const precision = object(state.precision_evidence);
      if (result?.replay?.step_count > 0) {
        precision.user_flow_replay = { contract: "AVANTIQO_CODE_USER_FLOW_REPLAY_V1", recorded: true, passed: result.replay.passed === true, verified: true, evidence_operation_ids: [operation.id], step_count: result.replay.step_count };
      }
      if (result?.accessibility) {
        precision.accessibility = { contract: "AVANTIQO_CODE_ACCESSIBILITY_V1", recorded: true, passed: result.accessibility.passed === true, verified: true, evidence_operation_ids: [operation.id], blocking_violation_count: (result.accessibility.missing_accessible_name?.length || 0) + (result.accessibility.images_without_alt?.length || 0) + (result.accessibility.heading_jump ? 1 : 0) };
      }
      if (result?.visual_difference_ratio != null) {
        precision.visual_regression = { contract: "AVANTIQO_CODE_VISUAL_REGRESSION_V1", recorded: true, passed: result.visual_passed === true, verified: true, evidence_operation_ids: [operation.id], difference_ratio: result.visual_difference_ratio, threshold: result.visual_threshold };
      }
      state.precision_evidence = precision;
      if (!passed) {
        const error = new Error("CODE_AI_BROWSER_VERIFICATION_FAILED");
        error.details = result;
        throw error;
      }
      return result;
    }
    case "diff":
      return workspace.diff();
    default:
      throw new Error(`CODE_AI_MISSION_ACTION_UNSUPPORTED:${operation.action}`);
  }
}

async function consumeMissionOwnerStopAtBoundary(state, controlContext) {
  if (!controlContext || !text(state?.mission_id, 240)) return null;
  const consumed = await consumePendingCodeAIOwnerStopAtSafeBoundary({
    context: controlContext,
    missionId: state.mission_id,
  });
  if (consumed?.applied !== true || !consumed?.intervention) return null;
  state.status = "stopped";
  state.blockers = [];
  state.current_operation_id = null;
  state.updated_at = now();
  state.owner_intervention = {
    id: consumed.intervention.id || null,
    contract: consumed.intervention.contract || null,
    lifecycle_contract: consumed.intervention.lifecycle_contract || null,
    action: "STOP",
    status: "APPLIED",
    claim_id: consumed.intervention.claim_id || null,
    claimed_at: consumed.intervention.claimed_at || state.updated_at,
    applied_at: consumed.intervention.applied_at || state.updated_at,
    fresh_reasoning_required: false,
    authorization_effect: "REDUCE_EXECUTION_ONLY",
    commit_authority: false,
    production_deploy_authority: false,
  };
  addEvidence(state, {
    kind: "owner_intervention",
    action: "STOP",
    status: "owner_stop_applied_before_repository_operation",
    authorization_effect: "REDUCE_EXECUTION_ONLY",
    source_mutation_performed: false,
    provider_execution_submitted: false,
    commit_authority: false,
    production_deploy_authority: false,
  });
  await publishCodeAILiveProgress({
    context: controlContext,
    state,
    event: {
      phase: "OWNER_STOPPED",
      status: "stopped",
      mission_id: state.mission_id,
      description: "Code stopped before the next repository operation on owner request.",
      reason: "CODE_AI_OWNER_STOP_REQUESTED",
      files_changed: list(state.files_changed),
    },
  }).catch(() => null);
  return {
    success: true,
    status: "stopped",
    reason: "CODE_AI_OWNER_STOP_REQUESTED",
    state,
    owner_stop_applied: true,
    source_mutation_performed: false,
    commit_performed: false,
    production_deploy_performed: false,
  };
}

export async function executeCodeAIMission({
  objective,
  objective_context = null,
  repository_url,
  ref = "main",
  operations,
  resume_state = null,
  mission_id = null,
  timeout_ms = null,
  workspace_target = null,
  organization_id = null,
  device_id = null,
  device_session_id = null,
  control_context = null,
} = {}) {
  const state = createState({
    objective,
    repositoryUrl: repository_url,
    ref,
    previous: resume_state || (text(mission_id) ? { mission_id: text(mission_id) } : null),
  });
  if (device_id && !state.device_id) state.device_id = text(device_id);
  if (device_session_id && !state.device_session_id) state.device_session_id = text(device_session_id);
  state.objective_context = {
    ...object(state.objective_context),
    ...object(objective_context),
    ...(organization_id ? { organization_id: text(organization_id) } : {}),
    ...(workspace_target ? { workspace_target: text(workspace_target) } : {}),
    ...(device_id ? { device_id: text(device_id) } : {}),
    ...(device_session_id ? { device_session_id: text(device_session_id) } : {}),
  };
  if (!state.objective) throw new Error("CODE_AI_MISSION_OBJECTIVE_REQUIRED");
  if (!state.repository_url) throw new Error("CODE_AI_MISSION_REPOSITORY_REQUIRED");
  if (
    resume_state &&
    normalizedRepositoryIdentity(resume_state.repository_url) !==
      normalizedRepositoryIdentity(repository_url || resume_state.repository_url)
  ) {
    throw new Error("CODE_AI_MISSION_RESUME_REPOSITORY_MISMATCH");
  }
  if (resume_state && text(resume_state.ref) !== text(ref || resume_state.ref)) {
    throw new Error("CODE_AI_MISSION_RESUME_REF_MISMATCH");
  }

  const plan = normalizedOperations(operations);
  const workspace = await CodeWorkspaceRuntime.open({
    repository_url: state.repository_url,
    ref: state.ref,
    resume_patch: state.patch,
    ...(workspace_target ? { workspace_target } : {}),
    ...(organization_id ? { organization_id } : {}),
    ...(device_id ? { device_id } : {}),
    ...(device_session_id ? { session_id: device_session_id } : {}),
    ...(timeout_ms ? { timeout_ms } : {}),
  });

  let attachedCodeLease = false;
  try {
    if (device_session_id && workspace.acquireEditLease) {
      await workspace.acquireEditLease({ owner: "CODE", ttl_ms: Math.max(120000, Number(timeout_ms) || 20 * 60 * 1000) });
      attachedCodeLease = true;
      addEvidence(state, { kind: "ide_edit_lease", owner: "CODE", status: "acquired", device_session_id });
    }
    if (state.base_commit && state.base_commit !== workspace.base_commit) {
      const previousBase = state.base_commit;
      state.base_commit = workspace.base_commit;
      const refreshed = await refreshSourceChanges(workspace, state).catch(() => null);
      if (refreshed?.diff?.patch !== undefined) state.patch = refreshed.diff.patch || null;
      state.status = "replan_required";
      state.blockers = [];
      state.current_operation_id = null;
      state.updated_at = now();
      addEvidence(state, {
        kind: "concurrency_replan",
        previous_base_commit: previousBase,
        current_base_commit: workspace.base_commit,
        resumed_patch_applied: workspace.resume.applied === true,
        actual_changed_paths: refreshed?.actual_changed_paths || [],
        unexpected_changed_paths: refreshed?.unexpected_changed_paths || [],
        reason: "CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
      });
      appendRepositoryGuidanceEvidence(state);
      return {
        success: false,
        status: state.status,
        state,
        reason: "CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
      };
    }
    state.base_commit = workspace.base_commit;
    if (!state.workspace_baseline_captured) {
      const baselineSnapshot = await workspace.diff();
      const knownMissionPaths = new Set(
        normalizedSourceChanges(state.source_changes).map((item) => item.path),
      );
      const workspaceChangedPaths = codeAIChangedPathsFromDiff(baselineSnapshot);
      state.workspace_baseline_changed_paths = workspaceChangedPaths.filter(
        (filePath) => !knownMissionPaths.has(filePath),
      );
      state.workspace_baseline_captured = true;
      addEvidence(state, {
        kind: "workspace_baseline",
        workspace_changed_paths: workspaceChangedPaths,
        baseline_changed_paths: state.workspace_baseline_changed_paths,
        known_mission_paths: [...knownMissionPaths],
        authorization_effect: "NONE",
      });
    }
    addEvidence(state, {
      kind: "workspace_opened",
      repository_url: state.repository_url,
      ref: state.ref,
      base_commit: state.base_commit,
      resumed_from_patch: workspace.resume.applied === true,
      workspace_target: workspace.workspace_target || workspace_target || null,
      workspace_transport: workspace.transport || null,
      device_id: workspace.device_id || device_id || null,
      device_name: workspace.device_name || null,
    });
    appendRepositoryGuidanceEvidence(state);

    for (const operation of plan) {
      if (state.completed_operation_ids.includes(operation.id)) continue;
      const ownerStop = await consumeMissionOwnerStopAtBoundary(state, control_context);
      if (ownerStop) return ownerStop;
      state.current_operation_id = operation.id;
      state.updated_at = now();
      await publishCodeAILiveProgress({
        context: control_context,
        state,
        event: {
          ...repositoryOperationProgress(operation, "running"),
          mission_id: state.mission_id,
          files_changed: list(state.files_changed),
        },
      }).catch(() => null);
      try {
        const result = await executeOperation(workspace, operation, state, control_context);
        state.completed_operation_ids = [...new Set([...state.completed_operation_ids, operation.id])];
        if (operation.action === "read") {
          state.source_read_evidence = [
            ...list(state.source_read_evidence),
            {
              at: now(),
              kind: "operation",
              operation_id: operation.id,
              action: "read",
              description: operation.description,
              status: "completed",
              result: bounded(result),
            },
          ].slice(-MAX_SOURCE_READ_EVIDENCE);
        }
        addEvidence(state, {
          kind: "operation",
          operation_id: operation.id,
          action: operation.action,
          description: operation.description,
          status: "completed",
          result,
        });
        await publishCodeAILiveProgress({
          context: control_context,
          state,
          event: {
            ...repositoryOperationProgress(operation, "completed"),
            mission_id: state.mission_id,
            files_changed: list(state.files_changed),
            verification_passed: list(state.verification).slice(-1)[0]?.passed ?? null,
          },
        }).catch(() => null);
      } catch (error) {
        const safeOperationReason = sanitizeCodeAIErrorReason(error, {
          label: "REPOSITORY_OPERATION",
          maximum: 700,
        });
        await publishCodeAILiveProgress({
          context: control_context,
          state,
          event: {
            ...repositoryOperationProgress(operation, "failed"),
            phase: "REPOSITORY_OPERATION_FAILED",
            status: "failed",
            mission_id: state.mission_id,
            reason: safeOperationReason,
            files_changed: list(state.files_changed),
          },
        }).catch(() => null);
        recordFailure(state, operation, error);
        const refreshed = await refreshSourceChanges(workspace, state).catch(() => null);
        if (refreshed?.diff?.patch !== undefined) state.patch = refreshed.diff.patch || null;
        if (refreshed?.unexpected_changed_paths?.length) {
          addEvidence(state, {
            kind: "undeclared_source_mutation",
            paths: refreshed.unexpected_changed_paths,
          });
        }
        const missingReadPath = missingRepositoryReadPath(operation, error);
        const missingVerifierPath = missingVerifierRepositoryPath(operation, error, workspace);
        const missingVerifierRecovery = missingVerifierPath
          ? await discoverMissingVerifierPath(workspace, operation, missingVerifierPath).catch(() => null)
          : null;
        const unrecognizedExecutable = unrecognizedMissionExecutable(operation, error);
        if (missingReadPath) {
          const requestedPath = text(operation?.input?.file_path || operation?.input?.path);
          state.status = "replan_required";
          state.current_operation_id = null;
          state.blockers = [];
          addEvidence(state, {
            kind: "missing_repository_read_path",
            operation_id: operation.id,
            requested_path: requestedPath || null,
            recovery: "SEARCH_REPOSITORY_AND_REPLAN",
            authorization_effect: "NONE",
          });
        } else if (missingVerifierPath) {
          state.status = "replan_required";
          state.current_operation_id = null;
          state.blockers = [];
          addEvidence(state, {
            kind: "missing_repository_verifier_path",
            operation_id: operation.id,
            requested_path: missingVerifierPath,
            candidate_paths: list(missingVerifierRecovery?.candidate_paths).slice(0, 12),
            candidate_count: Number(missingVerifierRecovery?.candidate_count || 0),
            discovered_candidate_paths: list(missingVerifierRecovery?.discovered_candidate_paths).slice(0, 12),
            recovery: "SEARCH_TRACKED_VERIFIER_PATH_AND_REPLAN",
            deterministic_repository_discovery: missingVerifierRecovery?.deterministic_repository_discovery === true,
            authorization_effect: "NONE",
          });
        } else if (unrecognizedExecutable) {
          state.status = "replan_required";
          state.current_operation_id = null;
          state.blockers = [];
          addEvidence(state, {
            kind: "unrecognized_repository_executable",
            operation_id: operation.id,
            requested_command: text(operation?.input?.command) || null,
            recovery: "USE_KNOWN_ENGINEERING_EXECUTABLE_OR_PACKAGE_SCRIPT_AND_REPLAN",
            authorization_effect: "NONE",
          });
        } else {
          state.status = operation.action === "verify" || operation.action === "run"
            ? "repair_required"
            : "blocked";
        }
        state.updated_at = now();
        appendRepositoryGuidanceEvidence(state);
        return {
          success: false,
          status: state.status,
          reason: missingReadPath
            ? "CODE_AI_MISSING_READ_PATH_REPLAN_REQUIRED"
            : missingVerifierPath
              ? "CODE_AI_MISSING_VERIFIER_PATH_REPLAN_REQUIRED"
              : unrecognizedExecutable
                ? "CODE_AI_UNRECOGNIZED_EXECUTABLE_REPLAN_REQUIRED"
                : safeOperationReason,
          state,
          failed_operation: operation,
          evidence: bounded(sanitizedCodeAIErrorDetails(error) || null),
        };
      }
    }

    const refreshed = await refreshSourceChanges(workspace, state);
    const finalDiff = refreshed.diff;
    state.patch = finalDiff.patch || null;
    const hasChanges = finalDiff.status.length > 0;
    const successfulVerification = state.verification.some((item) => item?.passed === true);

    if (refreshed.unexpected_changed_paths.length) {
      state.status = "repair_required";
      state.blockers = ["CODE_AI_UNDECLARED_SOURCE_MUTATION"];
    } else if (finalDiff.diff_check.exit_code !== 0) {
      state.status = "repair_required";
      state.blockers = ["CODE_AI_FINAL_DIFF_CHECK_FAILED"];
    } else if (hasChanges && !successfulVerification) {
      state.status = "verification_required";
      state.blockers = ["CODE_AI_CHANGED_FILES_REQUIRE_SUCCESSFUL_VERIFICATION"];
    } else {
      state.status = "completed";
      state.blockers = [];
      state.current_operation_id = null;
    }
    state.updated_at = now();
    addEvidence(state, {
      kind: "final_verification",
      status: state.status,
      has_changes: hasChanges,
      diff_check_exit_code: finalDiff.diff_check.exit_code,
      successful_verification: successfulVerification,
      source_change_count: state.source_changes.length + list(state.range_source_changes).length,
      range_source_change_count: list(state.range_source_changes).length,
      actual_changed_paths: refreshed.actual_changed_paths,
      unexpected_changed_paths: refreshed.unexpected_changed_paths,
      patch_bytes: finalDiff.patch_bytes,
    });
    appendRepositoryGuidanceEvidence(state);

    return {
      success: state.status === "completed",
      status: state.status,
      reason: state.blockers[0] || null,
      state,
      diff: finalDiff,
    };
  } finally {
    if (device_session_id && attachedCodeLease && workspace.releaseEditLease) {
      await workspace.releaseEditLease({ owner: "CODE" }).catch(() => null);
    }
    if (!device_session_id) await workspace.stop();
  }
}

export const CodeAIMissionRuntime = Object.freeze({
  contract: CONTRACT,
  repository_guidance_contract: REPOSITORY_GUIDANCE_CONTRACT,
  max_operations: MAX_OPERATIONS,
  actions: [...VALID_ACTIONS],
  execute: executeCodeAIMission,
});