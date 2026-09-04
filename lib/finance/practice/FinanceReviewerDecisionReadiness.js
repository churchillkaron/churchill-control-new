function clean(value) {
  return String(value ?? "").trim();
}

function positiveCount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function uniqueStrings(values = [], limit = 50) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = clean(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function hasMeaningfulWorkItemEvidence(value) {
  if (typeof value === "string") return clean(value).length > 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).some(([key, entry]) => {
    const normalizedKey = clean(key).toLowerCase();
    if (["system_verified", "system_checked_at"].includes(normalizedKey)) return false;
    if (entry == null) return false;
    if (typeof entry === "string") return clean(entry).length > 0;
    if (typeof entry === "number" || typeof entry === "boolean") return true;
    if (Array.isArray(entry)) return entry.length > 0;
    if (typeof entry === "object") return Object.keys(entry).length > 0;
    return false;
  });
}

export function evaluateFinanceReviewerDecisionReadiness(evidence) {
  if (!evidence || typeof evidence !== "object") {
    return {
      ready: false,
      state: "BLOCKED",
      blockers: ["Governed reviewer evidence preflight is unavailable"],
      controls: {
        conclusion_present: false,
        evidence_required: false,
        required_evidence_satisfied: false,
        source_evidence_count: 0,
        controlled_evidence_count: 0,
        approval_pending: 0,
        open_review_points: 0,
        system_applicable: false,
        system_satisfied: false,
        system_invalidated: false,
        ledger_population_complete: false,
        linked_ledger_lines: 0,
      },
    };
  }

  const workItem = evidence.work_item || {};
  const system = evidence.system_verification || {};
  const review = evidence.review_control || {};
  const sourceEvidence = evidence.evidence || {};
  const ledger = evidence.ledger_impact || {};
  const blockers = [];

  const conclusionPresent = clean(workItem.conclusion).length > 0;
  const evidenceRequired = workItem.metadata?.evidence_required === true;
  const sourceEvidenceCount = positiveCount(sourceEvidence.active_count);
  const controlledEvidenceCount = positiveCount(sourceEvidence.controlled_count);
  const approvalPending = positiveCount(sourceEvidence.approval_pending);
  const openReviewPoints = positiveCount(review.open_points);
  const systemApplicable = system.applicable === true;
  const systemInvalidated = Boolean(system.invalidated_at);
  const systemSatisfied = systemApplicable && system.satisfied === true && !systemInvalidated;
  const humanEvidencePresent = hasMeaningfulWorkItemEvidence(workItem.evidence);
  const requiredEvidenceSatisfied = !evidenceRequired || sourceEvidenceCount > 0 || humanEvidencePresent || systemSatisfied;
  const ledgerPopulationComplete = ledger.population_complete === true;
  const linkedLedgerLines = positiveCount(ledger.population?.linked_lines);

  if (clean(workItem.blocked_reason)) blockers.push(clean(workItem.blocked_reason));
  if (!conclusionPresent) blockers.push("Preparer conclusion is missing");

  const systemBlockers = Array.isArray(system.blockers) ? system.blockers : [];
  if (systemInvalidated) blockers.push("System verification was invalidated and must be refreshed before reviewer clearance");
  if (systemApplicable && system.satisfied !== true) {
    blockers.push(...systemBlockers);
    if (!systemBlockers.length) blockers.push("Required system verification is not satisfied");
  } else if (systemBlockers.length) {
    blockers.push(...systemBlockers);
  }

  if (openReviewPoints > 0) {
    blockers.push(`${openReviewPoints} open review point${openReviewPoints === 1 ? "" : "s"} must be resolved`);
  }
  if (approvalPending > 0) {
    blockers.push(`${approvalPending} evidence document approval${approvalPending === 1 ? "" : "s"} pending`);
  }
  if (!ledgerPopulationComplete) {
    blockers.push("Accounting population completeness has not been proven");
  }
  if (!requiredEvidenceSatisfied) {
    blockers.push("Required evidence is not present in the governed workpaper");
  }

  const uniqueBlockers = uniqueStrings(blockers);
  return {
    ready: uniqueBlockers.length === 0,
    state: uniqueBlockers.length === 0 ? "READY" : "BLOCKED",
    blockers: uniqueBlockers,
    controls: {
      conclusion_present: conclusionPresent,
      evidence_required: evidenceRequired,
      required_evidence_satisfied: requiredEvidenceSatisfied,
      source_evidence_count: sourceEvidenceCount,
      controlled_evidence_count: controlledEvidenceCount,
      approval_pending: approvalPending,
      open_review_points: openReviewPoints,
      system_applicable: systemApplicable,
      system_satisfied: systemSatisfied,
      system_invalidated: systemInvalidated,
      ledger_population_complete: ledgerPopulationComplete,
      linked_ledger_lines: linkedLedgerLines,
    },
  };
}

export function summarizeFinanceReviewerEvidencePreflight(evidence, readiness, checkedAt = new Date().toISOString()) {
  const result = readiness || evaluateFinanceReviewerDecisionReadiness(evidence);
  const sourceEvidence = evidence?.evidence || {};
  const system = evidence?.system_verification || {};
  const ledger = evidence?.ledger_impact || {};
  const activeLinks = Array.isArray(sourceEvidence.links)
    ? sourceEvidence.links.filter((link) => link?.status === "ACTIVE").slice(0, 100)
    : [];

  return {
    checked_at: checkedAt,
    ready: result.ready === true,
    state: result.state,
    blockers: uniqueStrings(result.blockers || [], 25),
    controls: result.controls,
    work_item_id: evidence?.work_item?.id || null,
    review_item_id: evidence?.review_item?.id || null,
    system_verification: {
      applicable: system.applicable === true,
      satisfied: system.satisfied === true,
      checked_at: system.checked_at || null,
      invalidated_at: system.invalidated_at || null,
      mode: system.mode || null,
    },
    ledger_population: {
      complete: ledger.population_complete === true,
      linked: ledger.linked === true,
      linked_lines: positiveCount(ledger.population?.linked_lines),
      current_period_lines: positiveCount(ledger.population?.current_period_lines),
    },
    evidence_documents: activeLinks.map((link) => ({
      link_id: link.id || null,
      document_id: link.document_id || link.document?.id || null,
      controlled: link.document?.controlled === true,
      version_number: link.document?.version_number || null,
      checksum_sha256: link.document?.checksum_sha256 || null,
      approval_required: link.document?.approval_required === true,
      approved_at: link.document?.approved_at || null,
      status: link.document?.status || link.status || null,
    })),
  };
}
