import { deriveCodeAICausalGraph } from "./CodeAIWorldClassIntelligenceRuntime.js";
import { analyzeCodeAISourceDependencies } from "./CodeAISyntaxAwareDependencyRuntime.js";

export const CODE_AI_STRATEGY_CONTRACT_ADMISSIBILITY =
  "AVANTIQO_CODE_AI_STRATEGY_CONTRACT_ADMISSIBILITY_V1";

const DESTRUCTIVE = /\b(?:remove|drop|delete|rename|eliminate|omit|bypass|replace|stop\s+returning|stop\s+using)\b/i;
const MAX_OBLIGATIONS = 40;
function text(value, maximum = 2200) { return String(value ?? "").trim().slice(0, maximum); }
function list(value) { return Array.isArray(value) ? value : []; }
function unique(values) { return [...new Set(values.map((v) => text(v, 600)).filter(Boolean))]; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function escaped(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function observedDocuments(state = {}) {
  const docs = new Map();
  for (const entry of [...list(state?.declared_evidence_reads), ...list(state?.source_read_evidence), ...list(state?.evidence)]) {
    if (text(entry?.action, 80) !== "read") continue;
    if (entry?.status && text(entry.status, 80) !== "completed") continue;
    const result = object(entry?.result);
    const path = text(result.file_path || result.path, 1200);
    const content = String(result.content ?? "");
    if (path && content) docs.set(path, content.slice(0, 30000));
  }
  return docs;
}

export function deriveCodeAIObservedStrategyContracts(state = {}) {
  const graph = deriveCodeAICausalGraph(state);
  const docs = observedDocuments(state);
  const obligations = [];
  const push = (entry) => {
    if (obligations.length >= MAX_OBLIGATIONS) return;
    const key = JSON.stringify(entry);
    if (!obligations.some((item) => JSON.stringify(item) === key)) obligations.push(entry);
  };
  for (const edge of list(graph?.edges)) {
    if (edge?.relation === "calls_imported_symbol" && text(edge?.target_symbol, 240)) {
      push({ kind: "IMPORTED_SYMBOL", token: text(edge.target_symbol, 240), path: text(edge.to, 1200), caller: text(edge.from, 1200) });
    }
    if (edge?.relation === "reads_imported_result_field" && text(edge?.result_field, 240)) {
      push({ kind: "RETURN_FIELD", token: text(edge.result_field, 240), path: text(edge.to, 1200), caller: text(edge.from, 1200) });
    }
  }
  for (const [path, content] of docs.entries()) {
    const analysis = analyzeCodeAISourceDependencies(path, content);
    for (const fn of list(analysis?.function_contracts)) {
      if (fn?.exported !== true) continue;
      for (const key of list(fn?.context_keys)) push({ kind: "BUSINESS_CONTEXT_KEY", token: text(key, 240), path, symbol: text(fn?.name, 240) });
    }
    for (const schema of list(analysis?.schema_references)) {
      if (text(schema?.kind, 80) !== "table") continue;
      for (const column of list(schema?.selected_columns)) push({ kind: "SUPABASE_SELECTED_COLUMN", token: text(column, 240), path, table: text(schema?.name, 500) });
    }
  }
  return {
    contract: CODE_AI_STRATEGY_CONTRACT_ADMISSIBILITY,
    obligation_count: obligations.length,
    obligations,
    bounded: true,
    incomplete_evidence_is_not_absence_of_contract: true,
    authorization_effect: "NONE",
  };
}

function explicitContradictions(direction, obligations) {
  const source = text(direction, 4000);
  if (!source || !DESTRUCTIVE.test(source)) return [];
  const conflicts = [];
  for (const obligation of obligations) {
    const token = text(obligation?.token, 240);
    if (!token) continue;
    const re = new RegExp(`.{0,90}\\b${escaped(token)}\\b.{0,90}`, "ig");
    for (const match of source.matchAll(re)) {
      if (DESTRUCTIVE.test(match[0])) { conflicts.push({ ...obligation, evidence: text(match[0], 240) }); break; }
    }
  }
  return conflicts.slice(0, 12);
}

export function filterCodeAIStrategyCompetitionByObservedContracts({ state = {}, competition = null } = {}) {
  const source = object(competition);
  const contracts = deriveCodeAIObservedStrategyContracts(state);
  const evaluated = list(source.ranked).map((candidate) => {
    const conflicts = explicitContradictions(candidate?.direction, contracts.obligations);
    return { ...candidate, contract_admissible: conflicts.length === 0, contract_conflicts: conflicts };
  });
  const ranked = evaluated.filter((candidate) => candidate.contract_admissible);
  const rejected = evaluated.filter((candidate) => !candidate.contract_admissible);
  const winner = ranked[0] || null;
  const strongestRejected = ranked[1] || null;
  return {
    ...source,
    contract: source.contract || "AVANTIQO_CODE_AI_SOLUTION_STRATEGY_COMPETITION_V1",
    ranked,
    selected: winner,
    strongest_rejected: strongestRejected,
    candidate_count: ranked.length,
    original_candidate_count: evaluated.length,
    contract_admissibility: contracts,
    contract_rejected_count: rejected.length,
    contract_rejected_candidates: rejected.map((candidate) => ({ id: candidate.id, direction: candidate.direction, contract_conflicts: candidate.contract_conflicts })).slice(0, 12),
    selection_margin: winner && strongestRejected ? Number(winner.score || 0) - Number(strongestRejected.score || 0) : Number(winner?.score || 0),
    explicit_contradictions_only: true,
    ambiguous_strategy_rejection_forbidden: true,
    additional_reasoning_calls: Number(source.additional_reasoning_calls || 0),
    authorization_effect: "NONE",
  };
}

export default Object.freeze({ contract: CODE_AI_STRATEGY_CONTRACT_ADMISSIBILITY, derive: deriveCodeAIObservedStrategyContracts, filter: filterCodeAIStrategyCompetitionByObservedContracts });
