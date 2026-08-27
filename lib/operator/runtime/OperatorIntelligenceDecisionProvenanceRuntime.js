export const OPERATOR_INTELLIGENCE_DECISION_PROVENANCE_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_PROVENANCE_V1";

const MAX_CANDIDATES = 12;
const MAX_EVIDENCE = 32;
const MAX_ASSUMPTIONS = 20;
const MAX_SCENARIOS = 8;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
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

function evidenceTrusted(source = {}) {
  const verificationStatus = text(source.verification_status, 40).toLowerCase();
  const outcome = text(source.outcome, 40).toLowerCase();
  return source.trusted === true || source.verified === true || (
    verificationStatus === "pass" && ["", "success", "succeeded", "completed", "verified"].includes(outcome)
  );
}

function normalizeEvidence(value = {}, index = 0) {
  const source = object(value);
  return {
    id: text(source.id || source.evidence_id, 160) || `evidence-${index + 1}`,
    trusted: evidenceTrusted(source),
    current: source.current !== false && source.superseded !== true,
    source_class: text(source.source_class || source.type || source.kind, 80) || null,
  };
}

function selectedCandidateId(deliberation = {}) {
  return text(object(object(deliberation).selected_candidate).id, 160) || null;
}

function normalizeCandidate(value = {}, index = 0) {
  const source = object(value);
  return {
    id: text(source.id, 160) || `candidate-${index + 1}`,
    title: text(source.title || source.description, 500) || null,
    kind: text(source.kind || source.type, 80).toLowerCase() || null,
    mutates: source.mutates === true || text(source.kind || source.type, 80).toLowerCase() === "action",
    requires_human: source.requires_human === true,
    evidence_ids: uniqueText(source.evidence_ids || source.supporting_evidence_ids, 160).slice(0, 20),
    unknown_dependencies: uniqueText(source.unknown_dependencies, 200).slice(0, 16),
  };
}

function normalizeAssumption(value = {}, index = 0) {
  const source = object(value);
  const status = text(source.status, 40).toLowerCase();
  const resolved = source.resolved === true || ["resolved", "verified", "proven", "satisfied"].includes(status);
  const invalidated = source.invalidated === true || ["invalid", "invalidated", "refuted", "contradicted"].includes(status);
  return {
    id: text(source.id, 160) || `assumption-${index + 1}`,
    statement: text(source.statement || source.title || source.description, 700) || null,
    critical: source.critical === true,
    resolved,
    invalidated,
    evidence_ids: uniqueText(source.evidence_ids, 160).slice(0, 16),
    validity_condition_ids: uniqueText(source.validity_condition_ids || source.condition_ids, 160).slice(0, 12),
  };
}

function scenarioDetails(scenarios = []) {
  return new Map(list(scenarios).slice(0, MAX_SCENARIOS).map((entry, index) => {
    const source = object(entry);
    const id = text(source.id, 160) || `scenario-${index + 1}`;
    return [id, {
      id,
      candidate_overrides: list(source.candidate_overrides).slice(0, 12).map((row) => ({
        candidate_id: text(object(row).candidate_id || object(row).id, 160),
        override_fields: Object.keys(object(object(row).overrides)).sort(),
      })),
      evidence_remove_ids: uniqueText(source.evidence_remove_ids, 160).slice(0, 16),
      uncertainty_addition_ids: list(source.uncertainty_additions).slice(0, 8).map((item, uncertaintyIndex) => {
        const uncertainty = typeof item === "string" ? { question: item } : object(item);
        return text(uncertainty.id || uncertainty.question, 160) || `${id}-uncertainty-${uncertaintyIndex + 1}`;
      }),
    }];
  }));
}

function changedScenarioLineage(robustness = {}, scenarios = [], selectedId = null) {
  const details = scenarioDetails(scenarios);
  return list(object(robustness).scenario_results)
    .filter((row) => object(row).material !== false && object(row).changed_from_baseline === true)
    .slice(0, MAX_SCENARIOS)
    .map((row) => {
      const source = object(row);
      const detail = details.get(text(source.id, 160)) || {};
      const selectedOverride = list(detail.candidate_overrides).find((entry) => entry.candidate_id === selectedId);
      return {
        id: text(source.id, 160) || null,
        kind: text(source.kind, 40).toLowerCase() || "plausible",
        verified: text(source.kind, 40).toLowerCase() === "verified",
        changed_from_baseline: true,
        resulting_candidate_id: text(object(source.selection).candidate_id, 160) || null,
        selected_candidate_override_fields: selectedOverride?.override_fields || [],
        evidence_remove_ids: detail.evidence_remove_ids || [],
        uncertainty_addition_ids: detail.uncertainty_addition_ids || [],
      };
    });
}

function validityLineage(validity = {}) {
  const source = object(validity);
  return {
    status: text(source.status, 100) || null,
    decision_valid_now: source.decision_valid_now === true,
    evidence_dependencies: list(source.evidence_dependencies).slice(0, 24).map((item) => ({
      id: text(object(item).id, 160) || null,
      required: object(item).required !== false,
      verified: object(item).verified === true,
      current: object(item).current !== false,
      stale: object(item).stale === true,
      valid: object(item).valid === true,
      issues: uniqueText(object(item).issues, 120).slice(0, 12),
    })),
    validity_conditions: list(source.validity_conditions).slice(0, 20).map((item) => ({
      id: text(object(item).id, 160) || null,
      required: object(item).required !== false,
      verified: object(item).verified === true,
      status: text(object(item).status, 40) || null,
      stale: object(item).stale === true,
      valid: object(item).valid === true,
      issues: uniqueText(object(item).issues, 120).slice(0, 12),
    })),
  };
}

function uncertaintyLineage(uncertaintyPriority = {}) {
  const source = object(uncertaintyPriority);
  const selected = object(source.selected_uncertainty);
  return {
    status: text(source.status, 100) || null,
    selected_uncertainty: text(selected.id, 160) ? {
      id: text(selected.id, 160),
      safety_critical: selected.safety_critical === true,
      decision_flip_possible: selected.decision_flip_possible === true,
      blocks_completion: selected.blocks_completion === true,
      blocks_governance: selected.blocks_governance === true,
      resolution_path: text(selected.resolution_path, 80) || null,
    } : null,
    actionable_count: Number.isFinite(Number(source.actionable_count)) ? Number(source.actionable_count) : 0,
  };
}

function readinessLineage(readiness = {}) {
  const source = object(readiness);
  return {
    status: text(source.status, 100) || null,
    decision_ready: source.decision_ready === true,
    failed_gates: list(source.gates)
      .filter((row) => object(row).passed !== true)
      .map((row) => ({
        name: text(object(row).name, 100) || null,
        code: text(object(row).code, 160) || null,
      })),
  };
}

export function buildOperatorIntelligenceDecisionProvenance({
  deliberation = {},
  candidates = [],
  evidence = [],
  assumptions = [],
  robustness = {},
  scenarios = [],
  validity = {},
  uncertainty_priority = {},
  readiness = {},
} = {}) {
  const selectedId = selectedCandidateId(deliberation);
  const normalizedCandidates = list(candidates).slice(0, MAX_CANDIDATES).map(normalizeCandidate);
  const selectedCandidate = normalizedCandidates.find((candidate) => candidate.id === selectedId) || null;
  const normalizedEvidence = list(evidence).slice(0, MAX_EVIDENCE).map(normalizeEvidence);
  const evidenceById = new Map(normalizedEvidence.map((item) => [item.id, item]));
  const normalizedAssumptions = list(assumptions).slice(0, MAX_ASSUMPTIONS).map(normalizeAssumption);
  const assumptionById = new Map(normalizedAssumptions.map((item) => [item.id, item]));

  const evidenceReferences = (selectedCandidate?.evidence_ids || []).map((id) => {
    const item = evidenceById.get(id);
    return {
      id,
      present: Boolean(item),
      trusted: item?.trusted === true,
      current: item?.current === true,
      trusted_current_support: Boolean(item?.trusted && item?.current),
      source_class: item?.source_class || null,
    };
  });
  const trustedCurrentSupportIds = evidenceReferences
    .filter((item) => item.trusted_current_support)
    .map((item) => item.id);

  const assumptionDependencies = (selectedCandidate?.unknown_dependencies || []).map((id) => {
    const assumption = assumptionById.get(id);
    return assumption ? { ...assumption, present: true } : {
      id,
      statement: null,
      critical: true,
      resolved: false,
      invalidated: false,
      evidence_ids: [],
      validity_condition_ids: [],
      present: false,
    };
  });

  const validityDependencies = validityLineage(validity);
  const uncertaintyDependencies = uncertaintyLineage(uncertainty_priority);
  const readinessDependencies = readinessLineage(readiness);
  const scenarioDependencies = changedScenarioLineage(robustness, scenarios, selectedId);

  const gaps = [];
  if (selectedId && !selectedCandidate) gaps.push("SELECTED_CANDIDATE_SOURCE_MISSING");
  if (selectedCandidate && trustedCurrentSupportIds.length === 0) gaps.push("NO_TRUSTED_CURRENT_SUPPORT");
  if (evidenceReferences.some((item) => !item.present)) gaps.push("REFERENCED_EVIDENCE_MISSING");
  if (evidenceReferences.some((item) => item.present && !item.trusted_current_support)) gaps.push("REFERENCED_EVIDENCE_NOT_TRUSTED_CURRENT");
  if (assumptionDependencies.some((item) => !item.present)) gaps.push("ASSUMPTION_DEPENDENCY_SOURCE_MISSING");
  if (assumptionDependencies.some((item) => item.invalidated)) gaps.push("ASSUMPTION_DEPENDENCY_INVALIDATED");
  if (assumptionDependencies.some((item) => !item.resolved)) gaps.push("ASSUMPTION_DEPENDENCY_UNRESOLVED");

  const invalidationTriggers = [];
  for (const dependency of validityDependencies.evidence_dependencies) {
    if (!dependency.valid) {
      invalidationTriggers.push({
        type: "EVIDENCE_DEPENDENCY_INVALID",
        id: dependency.id,
        reasons: dependency.issues,
      });
    }
  }
  for (const condition of validityDependencies.validity_conditions) {
    if (!condition.valid) {
      invalidationTriggers.push({
        type: condition.issues.includes("VERIFIED_CONDITION_CHANGED")
          ? "VERIFIED_VALIDITY_CONDITION_CHANGED"
          : "VALIDITY_CONDITION_INVALID",
        id: condition.id,
        reasons: condition.issues,
      });
    }
  }
  for (const assumption of assumptionDependencies) {
    if (!assumption.present || !assumption.resolved || assumption.invalidated) {
      invalidationTriggers.push({
        type: assumption.invalidated ? "ASSUMPTION_INVALIDATED" : "ASSUMPTION_UNRESOLVED",
        id: assumption.id,
        reasons: assumption.present ? [] : ["ASSUMPTION_SOURCE_MISSING"],
      });
    }
  }
  for (const scenario of scenarioDependencies) {
    invalidationTriggers.push({
      type: scenario.verified ? "VERIFIED_SCENARIO_CHANGES_DECISION" : "SCENARIO_SENSITIVITY",
      id: scenario.id,
      reasons: [
        ...scenario.selected_candidate_override_fields.map((field) => `SELECTED_CANDIDATE_${field.toUpperCase()}_CHANGED`),
        ...scenario.evidence_remove_ids.map((id) => `EVIDENCE_${id}_REMOVED`),
        ...scenario.uncertainty_addition_ids.map((id) => `UNCERTAINTY_${id}_ADDED`),
      ],
    });
  }
  if (uncertaintyDependencies.selected_uncertainty && (
    uncertaintyDependencies.selected_uncertainty.safety_critical ||
    uncertaintyDependencies.selected_uncertainty.decision_flip_possible
  )) {
    invalidationTriggers.push({
      type: "HIGH_VALUE_UNCERTAINTY_UNRESOLVED",
      id: uncertaintyDependencies.selected_uncertainty.id,
      reasons: [],
    });
  }

  let status = "DECISION_NOT_SELECTED";
  let nextAction = "DELIBERATE_BEFORE_BUILDING_PROVENANCE";
  if (selectedId) {
    if (gaps.length > 0) {
      status = "PROVENANCE_GAPS";
      nextAction = "CLOSE_PROVENANCE_GAPS_BEFORE_RELYING_ON_DECISION_LINEAGE";
    } else if (trustedCurrentSupportIds.length === 1) {
      status = "SINGLE_POINT_EVIDENCE_DEPENDENCY";
      nextAction = "ADD_INDEPENDENT_SUPPORT_OR_KEEP_DECISION_GUARDED";
    } else {
      status = "PROVENANCE_COMPLETE";
      nextAction = readinessDependencies.decision_ready
        ? "PRESENT_DECISION_WITH_STRUCTURED_LINEAGE_AND_INVALIDATION_BOUNDARIES"
        : "PRESERVE_LINEAGE_WHILE_COMPLETING_READINESS_GATES";
    }
  }

  return {
    success: true,
    contract: OPERATOR_INTELLIGENCE_DECISION_PROVENANCE_CONTRACT,
    status,
    next_action: nextAction,
    selected_candidate: selectedCandidate ? {
      id: selectedCandidate.id,
      title: selectedCandidate.title,
      kind: selectedCandidate.kind,
      mutates: selectedCandidate.mutates,
      requires_human: selectedCandidate.requires_human,
    } : selectedId ? { id: selectedId, source_missing: true } : null,
    deliberation_status: text(object(deliberation).status, 100) || null,
    deliberation_rationale_code: text(object(deliberation).rationale_code, 160) || null,
    trusted_current_support_ids: trustedCurrentSupportIds,
    single_point_evidence_dependency: trustedCurrentSupportIds.length === 1,
    evidence_lineage: evidenceReferences,
    assumption_lineage: assumptionDependencies,
    validity_lineage: validityDependencies,
    robustness_lineage: {
      status: text(object(robustness).status, 100) || null,
      changed_material_scenarios: scenarioDependencies,
    },
    uncertainty_lineage: uncertaintyDependencies,
    readiness_lineage: readinessDependencies,
    invalidation_triggers: invalidationTriggers,
    provenance_gaps: [...new Set(gaps)],
    provenance_policy: {
      exact_evidence_ids_only: true,
      trusted_current_support_distinguished_from_reference_only: true,
      unresolved_assumptions_are_explicit_dependencies: true,
      changed_material_scenarios_are_explicit_invalidation_boundaries: true,
      single_point_evidence_dependency_is_flagged: true,
      readiness_status_does_not_hide_provenance_gaps: true,
      raw_model_narrative_is_not_provenance: true,
      raw_chain_of_thought_is_never_required_or_persisted: true,
    },
    governance: {
      planning_only: true,
      executes_tools: false,
      authorizes_business_actions: false,
      provenance_is_not_execution_authority: true,
      provenance_is_not_completion_proof: true,
      prior_approval_never_substitutes_for_current_governance: true,
      mutation_authority_added: false,
      learning_state_mutated: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const OperatorIntelligenceDecisionProvenanceRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_DECISION_PROVENANCE_CONTRACT,
  build: buildOperatorIntelligenceDecisionProvenance,
});
