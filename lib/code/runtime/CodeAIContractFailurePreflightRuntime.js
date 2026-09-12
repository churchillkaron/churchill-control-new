import { deriveCodeAICausalGraph } from "./CodeAIWorldClassIntelligenceRuntime.js";

export const CODE_AI_CONTRACT_FAILURE_PREFLIGHT_CONTRACT =
  "AVANTIQO_CODE_AI_CONTRACT_FAILURE_PREFLIGHT_V1";

function text(value, maximum = 1200) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const CHECKS = Object.freeze({
  OBSERVED_IMPORTED_SYMBOL_REMOVED: {
    id: "PRESERVE_OBSERVED_IMPORTED_SYMBOLS",
    description: "Inventory caller-observed imported symbols before selecting or applying a provider edit.",
    evidence: (graph) => Number(graph.imported_symbol_call_edges_observed || 0) > 0,
  },
  OBSERVED_CALL_ARITY_INCOMPATIBLE: {
    id: "PRESERVE_OBSERVED_CALL_ARITY",
    description: "Preserve observed caller argument compatibility for imported function calls.",
    evidence: (graph) => list(graph.edges).some((edge) =>
      edge?.relation === "calls_imported_symbol" && Number.isInteger(edge?.observed_argument_count)
    ),
  },
  OBSERVED_RETURN_FIELD_REMOVED: {
    id: "PRESERVE_OBSERVED_RETURN_FIELDS",
    description: "Preserve statically observed returned fields consumed by imported-call consumers.",
    evidence: (graph) => list(graph.edges).some((edge) => edge?.relation === "reads_imported_result_field"),
  },
  BUSINESS_CONTEXT_INVARIANT_REMOVED: {
    id: "PRESERVE_BUSINESS_CONTEXT_INVARIANTS",
    description: "Preserve observed organization/entity/period context requirements across runtime edits.",
    evidence: (graph) => Number(graph.ast_parse_success_count || 0) > 0,
  },
  SUPABASE_SELECTED_COLUMN_REMOVED: {
    id: "PRESERVE_SUPABASE_SELECTED_COLUMNS",
    description: "Preserve explicit Supabase selected-column contracts or migrate dependent consumers coherently.",
    evidence: (graph) => list(graph.edges).some((edge) =>
      edge?.schema_kind === "table" && list(edge?.selected_columns).length > 0
    ),
  },
  SUPABASE_FILTER_KEY_REMOVED: {
    id: "PRESERVE_SUPABASE_FILTER_KEYS",
    description: "Preserve statically observed Supabase filter/tenant keys before persistence edits.",
    evidence: (graph) => list(graph.edges).some((edge) => edge?.schema_kind === "table"),
  },
  SUPABASE_MUTATION_FIELD_REMOVED: {
    id: "PRESERVE_SUPABASE_MUTATION_FIELDS",
    description: "Preserve statically observed Supabase mutation payload fields before persistence edits.",
    evidence: (graph) => list(graph.edges).some((edge) => edge?.schema_kind === "table"),
  },
  SUPABASE_RPC_ARGUMENT_KEY_REMOVED: {
    id: "PRESERVE_SUPABASE_RPC_ARGUMENT_KEYS",
    description: "Preserve statically observed RPC argument keys before changing database RPC callers.",
    evidence: (graph) => list(graph.edges).some((edge) => edge?.schema_kind === "rpc"),
  },
  NEXT_ROUTE_RESPONSE_FIELD_REMOVED: {
    id: "PRESERVE_NEXT_ROUTE_RESPONSE_FIELDS",
    description: "Preserve statically observed Next.js route JSON response fields before route edits.",
    evidence: (graph) => list(graph.nodes).some((node) => /(^|\/)app\/.*\/route\.(?:js|jsx|ts|tsx)$/i.test(text(node?.id || node?.path, 1200))),
  },
  NEXT_ROUTE_HANDLER_METHOD_REMOVED: {
    id: "PRESERVE_NEXT_ROUTE_METHODS",
    description: "Preserve observed Next.js route-handler method exports unless the route contract is intentionally migrated.",
    evidence: (graph) => list(graph.nodes).some((node) => /(^|\/)app\/.*\/route\.(?:js|jsx|ts|tsx)$/i.test(text(node?.id || node?.path, 1200))),
  },
});

export function deriveCodeAIContractFailurePreflight({ state = {}, learning = null } = {}) {
  const sourceLearning = object(
    learning || state?.verified_engineering_memory?.recurring_contract_failure_learning,
  );
  const patterns = list(sourceLearning.patterns).slice(0, 8);
  if (!patterns.length) {
    return {
      contract: CODE_AI_CONTRACT_FAILURE_PREFLIGHT_CONTRACT,
      active: false,
      check_count: 0,
      checks: [],
      model_call_performed: false,
      provider_call_performed: false,
      source_mutation_authority: false,
      authorization_effect: "NONE",
    };
  }
  const graph = deriveCodeAICausalGraph(state);
  const checks = patterns.flatMap((pattern) => {
    const kind = text(pattern?.kind, 160);
    const spec = CHECKS[kind];
    if (!spec) return [];
    return [{
      kind,
      check_id: spec.id,
      description: spec.description,
      verified_mission_count: Number(pattern?.verified_mission_count || 0),
      current_evidence_observed: spec.evidence(graph) === true,
      current_head_revalidation_required: true,
      concrete_patch_rejection_deferred_to_strategy_and_mutation_guards: true,
    }];
  });
  return {
    contract: CODE_AI_CONTRACT_FAILURE_PREFLIGHT_CONTRACT,
    active: checks.length > 0,
    check_count: checks.length,
    checks,
    evidence_ready_count: checks.filter((item) => item.current_evidence_observed).length,
    evidence_incomplete_count: checks.filter((item) => !item.current_evidence_observed).length,
    recurring_verified_failure_classes_only: true,
    minimum_distinct_verified_missions: Number(sourceLearning.minimum_distinct_verified_missions || 2),
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

export function formatCodeAIContractFailurePreflightForObjective(value = {}) {
  const checks = list(value?.checks);
  if (!checks.length) return "";
  return [
    "RECURRING CONTRACT FAILURE PREFLIGHT (DETERMINISTIC):",
    ...checks.map((item) =>
      `- ${text(item.check_id, 160)}: ${text(item.description, 1000)} ` +
      `(recurred in ${Number(item.verified_mission_count || 0)} verified missions; current evidence ${item.current_evidence_observed ? "observed" : "incomplete"}).`
    ),
    "These checks are controller-owned planning constraints. Missing current evidence is unknown, never proof of compatibility. Strategy and mutation guards remain authoritative once a concrete edit exists.",
  ].join("\n");
}

export default Object.freeze({
  contract: CODE_AI_CONTRACT_FAILURE_PREFLIGHT_CONTRACT,
  derive: deriveCodeAIContractFailurePreflight,
  formatForObjective: formatCodeAIContractFailurePreflightForObjective,
});
