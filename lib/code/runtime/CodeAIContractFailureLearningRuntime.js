export const CODE_AI_CONTRACT_FAILURE_LEARNING_CONTRACT =
  "AVANTIQO_CODE_AI_CONTRACT_FAILURE_LEARNING_V1";

const MAX_PATTERNS = 8;

function text(value, maximum = 1200) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const LESSONS = Object.freeze({
  OBSERVED_IMPORTED_SYMBOL_REMOVED:
    "Preserve caller-observed exported symbols unless every observed consumer is coherently migrated and reverified.",
  OBSERVED_CALL_ARITY_INCOMPATIBLE:
    "Preserve observed caller invocation compatibility; do not require arguments that current observed callers do not supply.",
  OBSERVED_RETURN_FIELD_REMOVED:
    "Preserve statically observed returned fields consumed by callers unless those consumers are coherently migrated and reverified.",
  BUSINESS_CONTEXT_INVARIANT_REMOVED:
    "Preserve observed business-context requirements such as organization/entity/period keys across runtime refactors.",
  SUPABASE_SELECTED_COLUMN_REMOVED:
    "Preserve explicitly observed Supabase selected-column contracts unless dependent consumers are coherently migrated and reverified.",
  SUPABASE_FILTER_KEY_REMOVED:
    "Preserve statically observed Supabase tenant/filter keys such as organization_id unless the data boundary is intentionally migrated and reverified.",
  SUPABASE_MUTATION_FIELD_REMOVED:
    "Preserve statically observed Supabase mutation payload fields unless the persistence contract is intentionally migrated and reverified.",
  SUPABASE_RPC_ARGUMENT_KEY_REMOVED:
    "Preserve statically observed Supabase RPC argument keys unless the RPC contract and every caller are intentionally migrated and reverified.",
  NEXT_ROUTE_RESPONSE_FIELD_REMOVED:
    "Preserve statically observed Next.js route response fields unless consumers and the route response contract are intentionally migrated and reverified.",
  NEXT_ROUTE_HANDLER_METHOD_REMOVED:
    "Preserve observed Next.js route-handler methods unless the route contract and its consumers are intentionally migrated and reverified.",
  TS_EXPORTED_TYPE_REMOVED:
    "Preserve exported TypeScript object contracts unless every consumer is intentionally migrated and reverified.",
  TS_EXPORTED_TYPE_PROPERTY_REMOVED:
    "Preserve exported TypeScript object properties unless the public type contract is intentionally migrated and reverified.",
  TS_EXPORTED_TYPE_PROPERTY_OPTIONALITY_CHANGED:
    "Preserve required-versus-optional semantics on exported TypeScript properties unless the public contract is intentionally migrated and reverified.",
  TS_PARAMETER_PROPERTY_REMOVED:
    "Preserve accepted TypeScript object-parameter properties used by existing callers unless callers are intentionally migrated and reverified.",
  TS_PARAMETER_OPTIONAL_PROPERTY_TIGHTENED:
    "Do not make an existing optional TypeScript input property required without migrating and reverifying callers.",
  TS_RETURN_PROPERTY_REMOVED:
    "Preserve typed return properties promised by exported functions unless consumers are intentionally migrated and reverified.",
  TS_RETURN_REQUIRED_PROPERTY_WEAKENED:
    "Do not weaken a required typed return property to optional without migrating and reverifying consumers.",
});

export function contractFailureKindsFromVerifiedMatch(match = {}) {
  const kinds = new Set();
  for (const failure of list(match?.failures)) {
    for (const violation of list(failure?.contract_violations)) {
      const kind = text(violation?.kind, 160);
      if (LESSONS[kind]) kinds.add(kind);
    }
  }
  return [...kinds];
}

export function deriveRecurringCodeAIContractFailureLessons(matches = []) {
  const counts = new Map();
  for (const match of list(matches)) {
    for (const kind of contractFailureKindsFromVerifiedMatch(match)) {
      counts.set(kind, (counts.get(kind) || 0) + 1);
    }
  }
  const patterns = [...counts.entries()]
    .filter(([, missionCount]) => missionCount >= 2)
    .map(([kind, missionCount]) => ({
      kind,
      verified_mission_count: missionCount,
      lesson: LESSONS[kind],
    }))
    .sort((a, b) => b.verified_mission_count - a.verified_mission_count || a.kind.localeCompare(b.kind))
    .slice(0, MAX_PATTERNS);
  return {
    contract: CODE_AI_CONTRACT_FAILURE_LEARNING_CONTRACT,
    recurring: patterns.length > 0,
    pattern_count: patterns.length,
    patterns,
    negative_engineering_lessons: patterns.map((item) =>
      `Recurring verified contract failure (${item.verified_mission_count} missions): ${item.lesson}`
    ),
    minimum_distinct_verified_missions: 2,
    current_head_revalidation_required: true,
    patch_replay_allowed: false,
    automatic_source_mutation_authority: false,
    authorization_effect: "NONE",
  };
}

export default Object.freeze({
  contract: CODE_AI_CONTRACT_FAILURE_LEARNING_CONTRACT,
  kindsFromMatch: contractFailureKindsFromVerifiedMatch,
  derive: deriveRecurringCodeAIContractFailureLessons,
});
