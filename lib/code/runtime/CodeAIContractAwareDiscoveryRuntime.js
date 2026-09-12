export const CODE_AI_CONTRACT_AWARE_DISCOVERY_CONTRACT =
  "AVANTIQO_CODE_AI_CONTRACT_AWARE_DISCOVERY_V1";

const MAX_TERMS = 6;
const MAX_PATHS = 4;

function text(value, maximum = 1200) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function safePath(value) {
  const candidate = text(value, 1000).replace(/^\.\//, "");
  if (!candidate || candidate.startsWith("/") || candidate.includes("..")) return null;
  if (!/\.[A-Za-z0-9]{1,12}$/.test(candidate)) return null;
  return candidate;
}
function unique(values, maximum) {
  return [...new Set(values.map((item) => text(item, 1000)).filter(Boolean))].slice(0, maximum);
}

export function deriveCodeAIContractAwareDiscovery({ memory = null } = {}) {
  const source = object(memory);
  const learning = object(source.recurring_contract_failure_learning);
  const recurringKinds = new Set(list(learning.patterns).map((item) => text(item?.kind, 160)).filter(Boolean));
  if (!recurringKinds.size) {
    return {
      contract: CODE_AI_CONTRACT_AWARE_DISCOVERY_CONTRACT,
      active: false,
      strategic_search_terms: [],
      priority_paths: [],
      recurring_failure_kinds: [],
      model_call_performed: false,
      provider_call_performed: false,
      authorization_effect: "NONE",
    };
  }

  const terms = [];
  const paths = [];
  for (const match of list(source.matches)) {
    for (const failure of list(match?.failures)) {
      for (const violation of list(failure?.contract_violations)) {
        const kind = text(violation?.kind, 160);
        if (!recurringKinds.has(kind)) continue;
        const path = safePath(violation?.path);
        if (path) paths.push(path);
        if (["OBSERVED_IMPORTED_SYMBOL_REMOVED", "OBSERVED_CALL_ARITY_INCOMPATIBLE", "NEXT_ROUTE_HANDLER_METHOD_REMOVED"].includes(kind)) {
          terms.push(violation?.symbol);
        }
        if (kind === "OBSERVED_RETURN_FIELD_REMOVED") terms.push(violation?.field);
        if (kind === "BUSINESS_CONTEXT_INVARIANT_REMOVED") terms.push(violation?.key);
        if (kind === "SUPABASE_SELECTED_COLUMN_REMOVED") {
          terms.push(violation?.table, violation?.column);
        }
        if (kind === "SUPABASE_FILTER_KEY_REMOVED") terms.push(violation?.table, violation?.key);
        if (kind === "SUPABASE_MUTATION_FIELD_REMOVED") terms.push(violation?.table, violation?.field);
        if (kind === "SUPABASE_RPC_ARGUMENT_KEY_REMOVED") terms.push(violation?.rpc, violation?.key);
        if (kind === "NEXT_ROUTE_RESPONSE_FIELD_REMOVED") terms.push(violation?.symbol, violation?.field);
      }
    }
  }

  return {
    contract: CODE_AI_CONTRACT_AWARE_DISCOVERY_CONTRACT,
    active: true,
    recurring_failure_kinds: [...recurringKinds].slice(0, 8),
    strategic_search_terms: unique(terms, MAX_TERMS),
    priority_paths: unique(paths, MAX_PATHS),
    search_terms_are_current_head_leads_only: true,
    historical_paths_are_current_head_leads_only: true,
    current_head_revalidation_required: true,
    incomplete_evidence_is_not_compatibility_proof: true,
    model_call_performed: false,
    provider_call_performed: false,
    source_mutation_authority: false,
    commit_authority: false,
    deploy_authority: false,
    authorization_effect: "NONE",
  };
}

export default Object.freeze({
  contract: CODE_AI_CONTRACT_AWARE_DISCOVERY_CONTRACT,
  derive: deriveCodeAIContractAwareDiscovery,
});
