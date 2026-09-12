import { deriveCodeAICausalGraph } from "./CodeAIWorldClassIntelligenceRuntime.js";

export const CODE_AI_OBSERVED_CONTRACT_GUARD = "AVANTIQO_CODE_AI_OBSERVED_CONTRACT_GUARD_V1";

const ROUTE_HANDLER = /(^|\/)app\/.*\/route\.(?:js|jsx|ts|tsx)$/i;
const HTTP_EXPORTS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function text(value, maximum = 1200) { return String(value ?? "").trim().slice(0, maximum); }
function list(value) { return Array.isArray(value) ? value : []; }
function unique(values) { return [...new Set(values.map((item) => text(item, 1200)).filter(Boolean))]; }
function observedReadContent(state, path) {
  const entries = [...list(state?.declared_evidence_reads), ...list(state?.source_read_evidence), ...list(state?.evidence)];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (text(entry?.action, 80) !== "read" || text(entry?.status, 80) !== "completed") continue;
    const result = entry?.result || {};
    if (text(result.file_path || result.path, 1200) !== path) continue;
    const content = String(result.content ?? "");
    if (content) return content;
  }
  return null;
}
function proposedState(state, writes) {
  const paths = unique(writes.map((item) => item?.path));
  return {
    ...state,
    files_changed: unique([...list(state?.files_changed), ...paths]),
    source_changes: [
      ...list(state?.source_changes).filter((entry) => !paths.includes(text(entry?.path, 1200))),
      ...writes.map((item) => ({ path: text(item?.path, 1200), operation: "write", content: String(item?.content ?? "") })),
    ],
  };
}
function currentStateForPaths(state, writes) {
  const paths = unique(writes.map((item) => item?.path));
  const syntheticReads = paths.flatMap((path, index) => {
    const content = observedReadContent(state, path);
    return content ? [{
      kind: "operation", action: "read", status: "completed",
      operation_id: `contract_guard_current_${index + 1}`,
      result: { file_path: path, content },
    }] : [];
  });
  return {
    ...state,
    files_changed: unique([...list(state?.files_changed), ...paths]),
    source_changes: list(state?.source_changes).filter((entry) => !paths.includes(text(entry?.path, 1200))),
    evidence: [...list(state?.evidence), ...syntheticReads],
  };
}

export function assessCodeAIObservedContractCompatibility({ state = {}, writes = [] } = {}) {
  const normalizedWrites = list(writes).map((item) => ({ path: text(item?.path, 1200), content: String(item?.content ?? "") })).filter((item) => item.path);
  if (!normalizedWrites.length) return { contract: CODE_AI_OBSERVED_CONTRACT_GUARD, required: false, compatible: true, violations: [] };
  const before = deriveCodeAICausalGraph(currentStateForPaths(state, normalizedWrites));
  const after = deriveCodeAICausalGraph(proposedState(state, normalizedWrites));
  const violations = [];
  const obligations = [];
  for (const write of normalizedWrites) {
    const beforeEntry = list(before.changed_path_consumers).find((entry) => entry?.path === write.path) || {};
    const afterEntry = list(after.changed_path_consumers).find((entry) => entry?.path === write.path) || {};
    const afterExports = new Set(list(afterEntry.observed_exports));
    const callerSymbols = unique(list(beforeEntry.observed_symbol_calls).map((call) => call?.target_symbol));
    for (const symbol of callerSymbols) {
      obligations.push({ path: write.path, kind: "OBSERVED_IMPORTED_SYMBOL", symbol });
      if (!afterExports.has(symbol)) violations.push({
        path: write.path,
        kind: "OBSERVED_IMPORTED_SYMBOL_REMOVED",
        symbol,
        observed_callers: list(beforeEntry.observed_symbol_calls).filter((call) => call?.target_symbol === symbol).map((call) => call?.caller),
      });
    }
    if (ROUTE_HANDLER.test(write.path)) {
      const beforeExports = new Set(list(beforeEntry.observed_exports));
      for (const method of HTTP_EXPORTS) {
        if (!beforeExports.has(method)) continue;
        obligations.push({ path: write.path, kind: "NEXT_ROUTE_HANDLER_METHOD", symbol: method });
        if (!afterExports.has(method)) violations.push({ path: write.path, kind: "NEXT_ROUTE_HANDLER_METHOD_REMOVED", symbol: method });
      }
    }
  }
  const observedCurrentSourceCount = normalizedWrites.filter((item) => observedReadContent(state, item.path)).length;
  return {
    contract: CODE_AI_OBSERVED_CONTRACT_GUARD,
    required: obligations.length > 0,
    compatible: violations.length === 0,
    obligation_count: obligations.length,
    obligations: obligations.slice(0, 40),
    violations: violations.slice(0, 40),
    observed_current_source_count: observedCurrentSourceCount,
    incomplete_evidence_is_not_compatibility_proof: true,
    model_call_performed: false,
    provider_call_performed: false,
    source_mutation_authority: false,
    authorization_effect: "NONE",
  };
}

export function assertCodeAIObservedContractCompatibility(input = {}) {
  const result = assessCodeAIObservedContractCompatibility(input);
  if (!result.compatible) {
    const error = new Error(`CODE_AI_OBSERVED_CONTRACT_VIOLATION:${result.violations.map((item) => `${item.path}#${item.symbol}`).join(",")}`);
    error.details = result;
    throw error;
  }
  return result;
}

export default Object.freeze({ contract: CODE_AI_OBSERVED_CONTRACT_GUARD, assess: assessCodeAIObservedContractCompatibility, assert: assertCodeAIObservedContractCompatibility });
