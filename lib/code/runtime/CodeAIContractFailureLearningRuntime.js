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
  NEXT_ROUTE_HANDLER_METHOD_REMOVED:
    "Preserve observed Next.js route-handler methods unless the route contract and its consumers are intentionally migrated and reverified.",
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
