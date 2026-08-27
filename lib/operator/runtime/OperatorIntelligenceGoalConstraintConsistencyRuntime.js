export const OPERATOR_INTELLIGENCE_GOAL_CONSTRAINT_CONSISTENCY_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_GOAL_CONSTRAINT_CONSISTENCY_V1";

const MAX_GOALS = 32;
const MAX_CONSTRAINTS = 96;
const MAX_ALIGNMENTS = 64;
const MAX_CLAIMS = 96;
const SUPPORTED_OPERATORS = new Set([
  "max",
  "min",
  "eq",
  "neq",
  "allowlist",
  "denylist",
  "truthy",
  "falsy",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function uniqueText(values, limit = 240) {
  const output = [];
  const seen = new Set();
  for (const value of list(values)) {
    const clean = text(value, limit);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeGoal(value = {}, index = 0) {
  const source = object(value);
  return {
    id: text(source.id || source.goal_id, 160) || `goal-${index + 1}`,
    parent_id: text(source.parent_id || source.parent_goal_id, 160) || null,
    title: text(source.title || source.goal || source.objective, 800) || null,
  };
}

function normalizeConstraint(value = {}, index = 0) {
  const source = object(value);
  const operator = text(source.operator || source.comparator, 40).toLowerCase();
  const issues = [];
  const id = text(source.id || source.constraint_id, 160) || `constraint-${index + 1}`;
  const goalId = text(source.goal_id, 160);
  const key = text(source.key || source.dimension || source.signal, 200);
  const verified = source.verified === true || text(source.verification_status, 40).toLowerCase() === "pass";
  const current = source.current !== false && source.superseded !== true;
  const sourceName = text(source.source || source.observation_source, 300);
  const hard = source.hard !== false;
  const inheritable = source.inheritable !== false;
  const requiresSubjectProof = source.requires_subject_proof !== false;

  if (!goalId) issues.push("CONSTRAINT_GOAL_ID_REQUIRED");
  if (!key) issues.push("CONSTRAINT_KEY_REQUIRED");
  if (!SUPPORTED_OPERATORS.has(operator)) issues.push("CONSTRAINT_OPERATOR_UNSUPPORTED");
  if (["max", "min"].includes(operator) && !isFiniteNumber(source.value)) {
    issues.push("NUMERIC_CONSTRAINT_REQUIRES_FINITE_NUMBER");
  }
  if (["allowlist", "denylist"].includes(operator) && !list(source.value).length) {
    issues.push("LIST_CONSTRAINT_REQUIRES_NONEMPTY_ARRAY");
  }
  if (["eq", "neq"].includes(operator) && source.value === undefined) {
    issues.push("CONSTRAINT_VALUE_REQUIRED");
  }

  return {
    id,
    goal_id: goalId || null,
    key: key || null,
    operator,
    value: source.value,
    hard,
    inheritable,
    requires_subject_proof: requiresSubjectProof,
    verified,
    current,
    source: sourceName || null,
    decisive: verified && current && Boolean(sourceName) && issues.length === 0,
    issues,
  };
}

function normalizeAlignment(value = {}, index = 0) {
  const source = object(value);
  const status = text(source.status || source.alignment, 40).toLowerCase();
  const verified = source.verified === true || text(source.verification_status, 40).toLowerCase() === "pass";
  const current = source.current !== false && source.superseded !== true;
  const sourceName = text(source.source || source.observation_source, 300);
  return {
    id: text(source.id, 160) || `alignment-${index + 1}`,
    child_goal_id: text(source.child_goal_id, 160) || null,
    parent_goal_id: text(source.parent_goal_id, 160) || null,
    status,
    verified,
    current,
    source: sourceName || null,
    decisive: verified && current && Boolean(sourceName) && ["supports", "compatible", "conflicts"].includes(status),
  };
}

function normalizeClaim(value = {}, index = 0) {
  const source = object(value);
  const verified = source.verified === true || text(source.verification_status, 40).toLowerCase() === "pass";
  const current = source.current !== false && source.superseded !== true;
  const sourceName = text(source.source || source.observation_source, 300);
  return {
    id: text(source.id || source.claim_id, 160) || `claim-${index + 1}`,
    key: text(source.key || source.dimension || source.signal, 200) || null,
    value: source.value,
    has_value: Object.prototype.hasOwnProperty.call(source, "value"),
    verified,
    current,
    source: sourceName || null,
    decisive: verified && current && Boolean(sourceName),
  };
}

function buildGoalChain(goals, targetGoalId) {
  const issues = [];
  const ids = goals.map((goal) => goal.id);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) issues.push("DUPLICATE_GOAL_ID");

  const byId = new Map(goals.map((goal) => [goal.id, goal]));
  if (!targetGoalId || !byId.has(targetGoalId)) {
    issues.push("TARGET_GOAL_NOT_FOUND");
    return { chain: [], issues, duplicate_goal_ids: duplicates };
  }

  const reversed = [];
  const seen = new Set();
  let current = byId.get(targetGoalId);
  while (current) {
    if (seen.has(current.id)) {
      issues.push("GOAL_HIERARCHY_CYCLE");
      break;
    }
    seen.add(current.id);
    reversed.push(current);
    if (!current.parent_id) break;
    const parent = byId.get(current.parent_id);
    if (!parent) {
      issues.push("GOAL_PARENT_NOT_FOUND");
      break;
    }
    current = parent;
  }

  return {
    chain: reversed.reverse(),
    issues: [...new Set(issues)],
    duplicate_goal_ids: duplicates,
  };
}

function isSubset(child, parent) {
  const parentValues = new Set(parent.map(stable));
  return child.every((value) => parentValues.has(stable(value)));
}

function hardConstraintWeakening(parent, child) {
  if (parent.key !== child.key || parent.operator !== child.operator) return false;
  if (parent.operator === "max") return child.value > parent.value;
  if (parent.operator === "min") return child.value < parent.value;
  if (parent.operator === "eq") return stable(child.value) !== stable(parent.value);
  if (parent.operator === "allowlist") return !isSubset(list(child.value), list(parent.value));
  if (parent.operator === "denylist") return !isSubset(list(parent.value), list(child.value));
  if (["truthy", "falsy"].includes(parent.operator)) return false;
  return false;
}

function hardConstraintSetConflicts(constraints) {
  const conflicts = [];
  const byKey = new Map();
  for (const constraint of constraints) {
    if (!byKey.has(constraint.key)) byKey.set(constraint.key, []);
    byKey.get(constraint.key).push(constraint);
  }

  for (const [key, rows] of byKey.entries()) {
    const maxRows = rows.filter((row) => row.operator === "max");
    const minRows = rows.filter((row) => row.operator === "min");
    const eqRows = rows.filter((row) => row.operator === "eq");
    const neqRows = rows.filter((row) => row.operator === "neq");
    const allowRows = rows.filter((row) => row.operator === "allowlist");
    const denyRows = rows.filter((row) => row.operator === "denylist");
    const truthy = rows.some((row) => row.operator === "truthy");
    const falsy = rows.some((row) => row.operator === "falsy");

    const maxValue = maxRows.length ? Math.min(...maxRows.map((row) => row.value)) : null;
    const minValue = minRows.length ? Math.max(...minRows.map((row) => row.value)) : null;
    if (maxValue !== null && minValue !== null && minValue > maxValue) {
      conflicts.push({ key, code: "HARD_MIN_EXCEEDS_HARD_MAX" });
    }

    const eqValues = [...new Set(eqRows.map((row) => stable(row.value)))];
    if (eqValues.length > 1) conflicts.push({ key, code: "CONFLICTING_HARD_EQUALITY_CONSTRAINTS" });
    if (eqRows.length) {
      const eqValue = eqRows[0].value;
      if (isFiniteNumber(eqValue) && maxValue !== null && eqValue > maxValue) conflicts.push({ key, code: "HARD_EQUALITY_EXCEEDS_HARD_MAX" });
      if (isFiniteNumber(eqValue) && minValue !== null && eqValue < minValue) conflicts.push({ key, code: "HARD_EQUALITY_BELOW_HARD_MIN" });
      if (neqRows.some((row) => stable(row.value) === stable(eqValue))) conflicts.push({ key, code: "HARD_EQUALITY_CONFLICTS_WITH_HARD_INEQUALITY" });
    }
    if (truthy && falsy) conflicts.push({ key, code: "CONFLICTING_HARD_BOOLEAN_CONSTRAINTS" });

    if (allowRows.length) {
      let allowed = list(allowRows[0].value);
      for (const row of allowRows.slice(1)) allowed = allowed.filter((value) => isSubset([value], list(row.value)));
      const denied = denyRows.flatMap((row) => list(row.value));
      const feasible = allowed.filter((value) => !denied.some((item) => stable(item) === stable(value)));
      if (!feasible.length) conflicts.push({ key, code: "HARD_ALLOWLIST_FULLY_DENIED" });
    }
  }
  return conflicts;
}

function evaluateConstraint(constraint, claim) {
  if (!claim.has_value && !["truthy", "falsy"].includes(constraint.operator)) {
    return { decided: false, satisfied: false, issue: "SUBJECT_VALUE_REQUIRED" };
  }
  if (constraint.operator === "max") {
    if (!isFiniteNumber(claim.value)) return { decided: false, satisfied: false, issue: "NUMERIC_CLAIM_REQUIRES_FINITE_NUMBER" };
    return { decided: true, satisfied: claim.value <= constraint.value, issue: null };
  }
  if (constraint.operator === "min") {
    if (!isFiniteNumber(claim.value)) return { decided: false, satisfied: false, issue: "NUMERIC_CLAIM_REQUIRES_FINITE_NUMBER" };
    return { decided: true, satisfied: claim.value >= constraint.value, issue: null };
  }
  if (constraint.operator === "eq") return { decided: true, satisfied: stable(claim.value) === stable(constraint.value), issue: null };
  if (constraint.operator === "neq") return { decided: true, satisfied: stable(claim.value) !== stable(constraint.value), issue: null };
  if (constraint.operator === "truthy") return { decided: true, satisfied: Boolean(claim.value) === true, issue: null };
  if (constraint.operator === "falsy") return { decided: true, satisfied: Boolean(claim.value) === false, issue: null };
  if (constraint.operator === "allowlist") {
    const values = Array.isArray(claim.value) ? claim.value : [claim.value];
    return { decided: true, satisfied: isSubset(values, list(constraint.value)), issue: null };
  }
  if (constraint.operator === "denylist") {
    const values = Array.isArray(claim.value) ? claim.value : [claim.value];
    const denied = list(constraint.value).map(stable);
    return { decided: true, satisfied: values.every((value) => !denied.includes(stable(value))), issue: null };
  }
  return { decided: false, satisfied: false, issue: "CONSTRAINT_OPERATOR_UNSUPPORTED" };
}

export function assessOperatorIntelligenceGoalConstraintConsistency({
  goals = [],
  target_goal_id,
  constraints = [],
  alignment_assertions = [],
  subject = {},
  decision_critical = true,
} = {}) {
  const normalizedGoals = list(goals).slice(0, MAX_GOALS).map(normalizeGoal);
  const targetGoalId = text(target_goal_id, 160);
  const hierarchy = buildGoalChain(normalizedGoals, targetGoalId);
  const chainIds = hierarchy.chain.map((goal) => goal.id);
  const depthByGoal = new Map(chainIds.map((id, index) => [id, index]));
  const targetDepth = Math.max(0, chainIds.length - 1);

  const normalizedConstraints = list(constraints).slice(0, MAX_CONSTRAINTS).map(normalizeConstraint);
  const applicableConstraints = normalizedConstraints.filter((constraint) => {
    const depth = depthByGoal.get(constraint.goal_id);
    if (depth === undefined) return false;
    return depth === targetDepth || constraint.inheritable;
  });

  const hardVerificationGaps = applicableConstraints
    .filter((constraint) => constraint.hard && !constraint.decisive)
    .map((constraint) => ({ id: constraint.id, goal_id: constraint.goal_id, key: constraint.key, issues: constraint.issues.length ? constraint.issues : [
      !constraint.verified ? "HARD_CONSTRAINT_VERIFICATION_REQUIRED" : null,
      !constraint.current ? "HARD_CONSTRAINT_CURRENTNESS_REQUIRED" : null,
      !constraint.source ? "HARD_CONSTRAINT_SOURCE_REQUIRED" : null,
    ].filter(Boolean) }));

  const decisiveHardConstraints = applicableConstraints.filter((constraint) => constraint.hard && constraint.decisive);
  const weakeningConflicts = [];
  for (const child of decisiveHardConstraints) {
    const childDepth = depthByGoal.get(child.goal_id);
    const ancestors = decisiveHardConstraints.filter((parent) =>
      depthByGoal.get(parent.goal_id) < childDepth &&
      parent.key === child.key &&
      parent.operator === child.operator,
    );
    for (const parent of ancestors) {
      if (hardConstraintWeakening(parent, child)) {
        weakeningConflicts.push({
          key: child.key,
          parent_constraint_id: parent.id,
          child_constraint_id: child.id,
          code: "CHILD_ATTEMPTS_TO_WEAKEN_HARD_CONSTRAINT",
        });
      }
    }
  }

  const hardSetConflicts = hardConstraintSetConflicts(decisiveHardConstraints);

  const normalizedAlignments = list(alignment_assertions).slice(0, MAX_ALIGNMENTS).map(normalizeAlignment);
  const alignmentResults = [];
  for (let index = 1; index < hierarchy.chain.length; index += 1) {
    const parent = hierarchy.chain[index - 1];
    const child = hierarchy.chain[index];
    const matches = normalizedAlignments.filter((row) => row.parent_goal_id === parent.id && row.child_goal_id === child.id);
    const decisive = matches.filter((row) => row.decisive);
    const statuses = [...new Set(decisive.map((row) => row.status))];
    let status = "UNPROVEN";
    if (statuses.includes("conflicts") || statuses.length > 1) status = "CONFLICT";
    else if (statuses.includes("supports") || statuses.includes("compatible")) status = "ALIGNED";
    alignmentResults.push({
      parent_goal_id: parent.id,
      child_goal_id: child.id,
      status,
      decisive_assertion_ids: decisive.map((row) => row.id),
    });
  }
  const verifiedGoalConflicts = alignmentResults.filter((row) => row.status === "CONFLICT");
  const alignmentGaps = alignmentResults.filter((row) => row.status === "UNPROVEN");

  const subjectSource = object(subject);
  const localViolations = uniqueText(subjectSource.constraint_violations || subjectSource.violates_constraints, 300).slice(0, 24);
  const normalizedClaims = list(subjectSource.claims).slice(0, MAX_CLAIMS).map(normalizeClaim);
  const claimResults = [];
  const hardViolations = localViolations.map((violation) => ({
    constraint_id: null,
    key: null,
    code: "SUBJECT_DECLARED_CONSTRAINT_VIOLATION",
    detail: violation,
  }));
  const proofGaps = [];
  const softWarnings = [];

  for (const constraint of applicableConstraints.filter((row) => row.decisive)) {
    const claims = normalizedClaims.filter((claim) => claim.key === constraint.key && claim.decisive);
    const distinctValues = [...new Set(claims.map((claim) => stable(claim.value)))];
    if (distinctValues.length > 1) {
      const gap = { constraint_id: constraint.id, key: constraint.key, code: "CONFLICTING_VERIFIED_SUBJECT_CLAIMS" };
      if (constraint.hard) proofGaps.push(gap); else softWarnings.push(gap);
      continue;
    }
    if (!claims.length) {
      if (constraint.hard && constraint.requires_subject_proof) {
        proofGaps.push({ constraint_id: constraint.id, key: constraint.key, code: "VERIFIED_CURRENT_SUBJECT_CLAIM_REQUIRED" });
      }
      continue;
    }
    const evaluation = evaluateConstraint(constraint, claims[0]);
    claimResults.push({
      constraint_id: constraint.id,
      key: constraint.key,
      claim_id: claims[0].id,
      decided: evaluation.decided,
      satisfied: evaluation.satisfied,
      issue: evaluation.issue,
    });
    if (!evaluation.decided) {
      const gap = { constraint_id: constraint.id, key: constraint.key, code: evaluation.issue || "CONSTRAINT_PROOF_INCONCLUSIVE" };
      if (constraint.hard) proofGaps.push(gap); else softWarnings.push(gap);
    } else if (!evaluation.satisfied) {
      const violation = { constraint_id: constraint.id, key: constraint.key, code: "SUBJECT_VIOLATES_EFFECTIVE_CONSTRAINT" };
      if (constraint.hard) hardViolations.push(violation); else softWarnings.push(violation);
    }
  }

  let status = "CONSISTENCY_PROVEN";
  let nextAction = "PRESERVE_INHERITED_CONSTRAINTS_DURING_DOWNSTREAM_PLANNING";
  if (hierarchy.issues.length) {
    status = "GOAL_HIERARCHY_INVALID";
    nextAction = "REPAIR_GOAL_HIERARCHY_BEFORE_RELYING_ON_DESCENDANT_PLANNING";
  } else if (verifiedGoalConflicts.length) {
    status = "GOAL_CONFLICT";
    nextAction = "RESOLVE_VERIFIED_PARENT_CHILD_GOAL_CONFLICT_BEFORE_DOWNSTREAM_PLANNING";
  } else if (weakeningConflicts.length || hardSetConflicts.length) {
    status = "HARD_CONSTRAINT_CONFLICT";
    nextAction = "REMOVE_CHILD_WEAKENING_OR_RECONCILE_UNSATISFIABLE_HARD_CONSTRAINTS";
  } else if (hardViolations.length) {
    status = "HARD_CONSTRAINT_VIOLATION";
    nextAction = "REJECT_CURRENT_SUBJECT_FOR_PLANNING_AND_GENERATE_A_CONSTRAINT_COMPLIANT_ALTERNATIVE";
  } else if (hardVerificationGaps.length) {
    status = "HARD_CONSTRAINT_VERIFICATION_REQUIRED";
    nextAction = "VERIFY_CURRENT_HARD_CONSTRAINTS_FROM_DECLARED_SOURCES_BEFORE_PLANNING";
  } else if (alignmentGaps.length) {
    status = "GOAL_ALIGNMENT_UNPROVEN";
    nextAction = "VERIFY_PARENT_CHILD_GOAL_ALIGNMENT_BEFORE_CLAIMING_HIERARCHICAL_CONSISTENCY";
  } else if (proofGaps.length) {
    status = "CONSTRAINT_PROOF_REQUIRED";
    nextAction = "OBTAIN_CURRENT_VERIFIED_SUBJECT_CLAIMS_FOR_ALL_REQUIRED_HARD_CONSTRAINTS";
  }

  const consistencyProven = status === "CONSISTENCY_PROVEN";
  return {
    success: true,
    contract: OPERATOR_INTELLIGENCE_GOAL_CONSTRAINT_CONSISTENCY_CONTRACT,
    status,
    next_action: nextAction,
    consistency_proven: consistencyProven,
    decision_critical: decision_critical !== false,
    target_goal_id: targetGoalId || null,
    goal_chain: hierarchy.chain,
    hierarchy_issues: hierarchy.issues,
    duplicate_goal_ids: hierarchy.duplicate_goal_ids,
    alignment_results: alignmentResults,
    verified_goal_conflicts: verifiedGoalConflicts,
    alignment_gaps: alignmentGaps,
    effective_hard_constraints: decisiveHardConstraints,
    hard_constraint_verification_gaps: hardVerificationGaps,
    hard_constraint_weakening_conflicts: weakeningConflicts,
    hard_constraint_set_conflicts: hardSetConflicts,
    subject: {
      id: text(subjectSource.id, 160) || null,
      kind: text(subjectSource.kind || subjectSource.type, 80) || null,
      claim_results: claimResults,
      local_constraint_violations: localViolations,
    },
    hard_constraint_violations: hardViolations,
    constraint_proof_gaps: proofGaps,
    soft_constraint_warnings: softWarnings,
    consistency_policy: {
      hard_ancestor_constraints_inherit_downward: true,
      child_goals_may_tighten_but_never_weaken_hard_ancestor_constraints: true,
      incompatible_hard_constraints_fail_closed: true,
      verified_goal_conflict_blocks_descendant_planning: true,
      parent_child_alignment_requires_current_verified_sourced_assertion: true,
      hard_constraint_authority_requires_current_verified_sourced_record: true,
      subject_compliance_requires_current_verified_sourced_claims: true,
      numeric_string_coercion_disabled: true,
      freeform_goal_text_is_never_constraint_proof: true,
      model_numeric_goal_scores_are_never_authority: true,
      local_progress_never_overrides_ancestor_constraints: true,
      lower_level_optimization_never_overrides_higher_level_hard_constraints: true,
    },
    governance: {
      planning_and_verification_only: true,
      executes_tools: false,
      authorizes_business_actions: false,
      mutates_business_state: false,
      rewrites_parent_goals: false,
      waives_hard_constraints: false,
      triggers_recovery: false,
      promotes_learning_state: false,
      current_permissions_confirmation_wallet_and_verification_still_apply: true,
      hierarchy_consistency_is_not_execution_authority: true,
      mutation_authority_added: false,
      learning_state_mutated: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const OperatorIntelligenceGoalConstraintConsistencyRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_GOAL_CONSTRAINT_CONSISTENCY_CONTRACT,
  assess: assessOperatorIntelligenceGoalConstraintConsistency,
});
