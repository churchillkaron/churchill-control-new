import { createHash } from "node:crypto";

export const FINANCE_REVIEW_EVIDENCE_FINGERPRINT_VERSION = 1;

const SECTION_LABELS = Object.freeze({
  preparer_work: "Preparer workpaper changed",
  period_context: "Accounting period context changed",
  evidence_documents: "Source evidence changed",
  system_verification: "System verification changed",
  journal_entries: "Linked journals changed",
  ledger_exact: "Exact linked ledger evidence changed",
  ledger_period: "Linked account period movement changed",
  control_records: "Linked accounting control changed",
});

function clean(value) {
  return String(value ?? "").trim();
}

function canonical(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value
      .map(canonical)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function activeEvidenceDocuments(evidence) {
  return (evidence?.evidence?.links || [])
    .filter((link) => link?.status === "ACTIVE")
    .map((link) => ({
      link_id: link.id || null,
      document_id: link.document_id || link.document?.id || null,
      evidence_category: link.evidence_category || null,
      link_status: link.status || null,
      is_primary: link.is_primary === true,
      link_updated_at: link.updated_at || null,
      document: link.document ? {
        id: link.document.id || null,
        source: link.document.source || null,
        controlled: link.document.controlled === true,
        status: link.document.status || null,
        approval_required: link.document.approval_required === true,
        approved_at: link.document.approved_at || null,
        version_number: link.document.version_number || null,
        checksum_sha256: link.document.checksum_sha256 || null,
        updated_at: link.document.updated_at || null,
      } : null,
    }));
}

function linkedAccounts(evidence) {
  return (evidence?.ledger_impact?.accounts || []).map((account) => ({
    account_id: account.account_id || null,
    account_code: account.account_code || null,
    account_name: account.account_name || null,
    linked_impact: account.linked_impact || null,
    current_period_movement: account.current_period_movement || null,
  }));
}

function sourceSections(evidence) {
  const workItem = evidence?.work_item || {};
  const period = evidence?.period || {};
  const ledger = evidence?.ledger_impact || {};

  return {
    preparer_work: {
      work_item_id: workItem.id || null,
      conclusion: workItem.conclusion || null,
      evidence: workItem.evidence ?? null,
      evidence_required: workItem.metadata?.evidence_required === true,
    },
    period_context: {
      source: period.source || null,
      current: period.current ? {
        id: period.current.id || null,
        start_date: period.current.start_date || null,
        end_date: period.current.end_date || null,
        status: period.current.status || null,
        closed_at: period.current.closed_at || null,
      } : null,
      previous: period.previous ? {
        id: period.previous.id || null,
        start_date: period.previous.start_date || null,
        end_date: period.previous.end_date || null,
        status: period.previous.status || null,
        closed_at: period.previous.closed_at || null,
      } : null,
    },
    evidence_documents: activeEvidenceDocuments(evidence),
    system_verification: {
      mode: evidence?.system_verification?.mode || null,
      applicable: evidence?.system_verification?.applicable === true,
      satisfied: evidence?.system_verification?.satisfied === true,
      checked_at: evidence?.system_verification?.checked_at || null,
      invalidated_at: evidence?.system_verification?.invalidated_at || null,
      blockers: evidence?.system_verification?.blockers || [],
      evidence: evidence?.system_verification?.evidence || [],
    },
    journal_entries: ledger.journal_entries || [],
    ledger_exact: ledger.linked_lines || [],
    ledger_period: linkedAccounts(evidence),
    control_records: evidence?.control_records || {},
  };
}

function scopeOf(evidence) {
  return {
    organization_id: evidence?.run?.organization_id || evidence?.review_item?.organization_id || null,
    entity_id: evidence?.run?.entity_id || evidence?.review_item?.entity_id || null,
    period_id: evidence?.run?.period_id || evidence?.review_item?.period_id || null,
    run_id: evidence?.run?.id || null,
    work_item_id: evidence?.work_item?.id || null,
    review_item_id: evidence?.review_item?.id || null,
  };
}

export function buildFinanceReviewEvidenceFingerprint(evidence) {
  const sections = sourceSections(evidence);
  const sectionDigests = Object.fromEntries(
    Object.entries(sections).map(([name, value]) => [name, digest(value)]),
  );
  const scope = scopeOf(evidence);
  const fingerprint = {
    version: FINANCE_REVIEW_EVIDENCE_FINGERPRINT_VERSION,
    scope,
    sections: sectionDigests,
  };

  return {
    ...fingerprint,
    digest: digest(fingerprint),
    summary: {
      evidence_document_count: activeEvidenceDocuments(evidence).length,
      linked_ledger_line_count: Number(evidence?.ledger_impact?.population?.linked_lines || 0),
      linked_journal_count: Number(evidence?.ledger_impact?.population?.journal_entries || 0),
      linked_account_ids: linkedAccounts(evidence).map((account) => account.account_id).filter(Boolean).sort(),
      control_record_count: Object.values(evidence?.control_records || {}).reduce(
        (total, rows) => total + (Array.isArray(rows) ? rows.length : 0),
        0,
      ),
    },
  };
}

export function compareFinanceReviewEvidenceFingerprints(stored, current) {
  if (!stored || !current) return { matches: false, changed_sections: Object.keys(SECTION_LABELS) };
  if (Number(stored.version) !== FINANCE_REVIEW_EVIDENCE_FINGERPRINT_VERSION) {
    return { matches: false, changed_sections: Object.keys(SECTION_LABELS), version_mismatch: true };
  }

  const changedSections = Object.keys(SECTION_LABELS).filter(
    (section) => clean(stored?.sections?.[section]) !== clean(current?.sections?.[section]),
  );
  const scopeChanged = digest(stored.scope || {}) !== digest(current.scope || {});
  return {
    matches: !scopeChanged && clean(stored.digest) === clean(current.digest) && changedSections.length === 0,
    changed_sections: changedSections,
    scope_changed: scopeChanged,
  };
}

export function evaluateFinanceReviewEvidenceFreshness({ evidence, reviewerSignoff = null }) {
  const current = buildFinanceReviewEvidenceFingerprint(evidence);
  const stored = reviewerSignoff?.metadata?.review_evidence_fingerprint || null;

  if (!reviewerSignoff) {
    return {
      state: "UNPROVEN",
      trusted: false,
      reason: "Reviewer sign-off is missing",
      changed_sections: [],
      changed_labels: [],
      current_fingerprint: current,
      stored_fingerprint: null,
    };
  }

  if (!stored?.digest) {
    return {
      state: "UNPROVEN",
      trusted: false,
      reason: "Reviewer sign-off predates deterministic evidence freshness and must be re-reviewed",
      changed_sections: Object.keys(SECTION_LABELS),
      changed_labels: Object.values(SECTION_LABELS),
      current_fingerprint: current,
      stored_fingerprint: stored,
    };
  }

  const comparison = compareFinanceReviewEvidenceFingerprints(stored, current);
  return {
    state: comparison.matches ? "CURRENT" : "STALE",
    trusted: comparison.matches,
    reason: comparison.matches
      ? "Reviewer sign-off matches current governed accounting evidence"
      : "Governed accounting evidence changed after reviewer sign-off",
    changed_sections: comparison.changed_sections,
    changed_labels: comparison.changed_sections.map((section) => SECTION_LABELS[section] || section),
    scope_changed: comparison.scope_changed === true,
    version_mismatch: comparison.version_mismatch === true,
    current_fingerprint: current,
    stored_fingerprint: stored,
  };
}
