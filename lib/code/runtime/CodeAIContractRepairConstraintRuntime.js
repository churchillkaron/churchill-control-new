export const CODE_AI_CONTRACT_REPAIR_CONSTRAINT_CONTRACT =
  "AVANTIQO_CODE_AI_CONTRACT_REPAIR_CONSTRAINT_V1";

function text(value, maximum = 1200) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function constraintForViolation(violation = {}) {
  const source = object(violation);
  const path = text(source.path, 1200) || null;
  const kind = text(source.kind, 120) || "OBSERVED_CONTRACT_VIOLATION";
  const symbol = text(source.symbol, 240) || null;
  const field = text(source.field, 240) || null;
  const key = text(source.key, 240) || null;
  const table = text(source.table, 500) || null;
  const rpc = text(source.rpc, 500) || null;
  const column = text(source.column, 240) || null;

  let requirement = "Preserve the observed compatibility contract.";
  if (kind === "OBSERVED_IMPORTED_SYMBOL_REMOVED") requirement = `Preserve exported symbol ${symbol}.`;
  else if (kind === "NEXT_ROUTE_HANDLER_METHOD_REMOVED") requirement = `Preserve Next.js route handler export ${symbol}.`;
  else if (kind === "OBSERVED_CALL_ARITY_INCOMPATIBLE") requirement = `Keep ${symbol} callable with ${Number(source.observed_argument_count)} observed argument(s).`;
  else if (kind === "OBSERVED_RETURN_FIELD_REMOVED") requirement = `Preserve returned field ${field} from ${symbol}.`;
  else if (kind === "BUSINESS_CONTEXT_INVARIANT_REMOVED") requirement = `Preserve business-context key ${key} in ${symbol}.`;
  else if (kind === "SUPABASE_SELECTED_COLUMN_REMOVED") requirement = `Preserve selected Supabase column ${column} for ${table}.`;
  else if (kind === "SUPABASE_FILTER_KEY_REMOVED") requirement = `Preserve Supabase filter key ${key} for ${table}.`;
  else if (kind === "SUPABASE_MUTATION_FIELD_REMOVED") requirement = `Preserve Supabase mutation field ${field} for ${table}.`;
  else if (kind === "SUPABASE_RPC_ARGUMENT_KEY_REMOVED") requirement = `Preserve RPC argument key ${key} for ${rpc}.`;
  else if (kind === "NEXT_ROUTE_RESPONSE_FIELD_REMOVED") requirement = `Preserve Next.js ${symbol} response field ${field}.`;

  return {
    kind,
    path,
    symbol,
    field,
    key,
    table,
    rpc,
    column,
    observed_argument_count: Number.isInteger(Number(source.observed_argument_count))
      ? Number(source.observed_argument_count)
      : null,
    requirement,
  };
}

export function deriveCodeAIContractRepairConstraints(failure = null) {
  const source = object(failure);
  const result = object(source.result || source.details);
  const violations = list(result.violations).slice(0, 12).map(constraintForViolation);
  return {
    contract: CODE_AI_CONTRACT_REPAIR_CONSTRAINT_CONTRACT,
    required: violations.length > 0,
    source_failure_message: text(source.message, 300) || null,
    constraint_count: violations.length,
    constraints: violations,
    must_materially_change_rejected_patch: violations.length > 0,
    current_repository_evidence_remains_authoritative: true,
    incomplete_evidence_is_not_compatibility_proof: true,
    model_call_performed: false,
    provider_call_performed: false,
    source_mutation_authority: false,
    commit_authority: false,
    deploy_authority: false,
    authorization_effect: "NONE",
  };
}

export function latestCodeAIContractRepairConstraints(state = {}) {
  const failures = list(state?.failures);
  for (let index = failures.length - 1; index >= 0; index -= 1) {
    const failure = object(failures[index]);
    if (!text(failure.message, 300).startsWith("CODE_AI_OBSERVED_CONTRACT_VIOLATION:")) continue;
    const projected = deriveCodeAIContractRepairConstraints(failure);
    if (projected.required) return projected;
  }
  return deriveCodeAIContractRepairConstraints(null);
}

export function formatCodeAIContractRepairConstraintsForObjective(value = {}) {
  const constraints = list(value?.constraints);
  if (!constraints.length) return null;
  return [
    "DETERMINISTIC CONTRACT REPAIR CONSTRAINTS:",
    ...constraints.map((item) => `- ${item.path || "observed boundary"}: ${item.requirement}`),
    "The previous patch was rejected before mutation. Produce a materially different repair that satisfies every constraint. Do not weaken or delete the observed contract to make the patch pass.",
  ].join("\n");
}

export default Object.freeze({
  contract: CODE_AI_CONTRACT_REPAIR_CONSTRAINT_CONTRACT,
  derive: deriveCodeAIContractRepairConstraints,
  latest: latestCodeAIContractRepairConstraints,
  formatForObjective: formatCodeAIContractRepairConstraintsForObjective,
});
