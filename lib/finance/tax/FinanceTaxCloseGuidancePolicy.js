const BLOCKING_CHECKS = new Set([
  "REGISTRATION_REFERENCE",
  "VAT_RULES",
  "OUTPUT_CODING",
  "OUTPUT_POSTING",
  "INPUT_CODING",
  "INPUT_POSTING",
  "EXCHANGE_RATES",
  "TAX_CALENDAR_AUTHORITY",
  "CALCULATION_FRESHNESS",
]);

const WARNING_CHECKS = new Set([
  "POTENTIAL_DUPLICATES",
  "FILING_DEADLINE",
]);

const CLIENT_EVIDENCE_CHECKS = new Set(["REGISTRATION_REFERENCE"]);

const ACTIONS = Object.freeze({
  REGISTRATION_REFERENCE: {
    title: "Confirm VAT registration evidence",
    action: "Obtain or verify the entity VAT registration reference, then refresh Tax.",
    resolution: "Resolved only when the governed entity/profile contains the registration reference used by the filing.",
  },
  VAT_RULES: {
    title: "Repair VAT rule coverage",
    action: "Configure an active VAT rule covering this jurisdiction and filing period.",
    resolution: "Resolved only when live VAT rules cover the filing jurisdiction and period.",
  },
  OUTPUT_CODING: {
    title: "Correct sales VAT coding",
    action: "Review the affected sales lines and correct missing, unresolved or ineffective governed VAT rules at source.",
    resolution: "Resolved only when every tax-bearing sales line resolves to an active, effective VAT rule.",
  },
  OUTPUT_POSTING: {
    title: "Restore sales posting evidence",
    action: "Post the affected sales documents correctly or replace reversed posting evidence through the governed journal workflow.",
    resolution: "Resolved only when VAT-bearing sales have valid, non-reversed POSTED journal evidence.",
  },
  INPUT_CODING: {
    title: "Correct purchase VAT coding",
    action: "Review the affected vendor invoice lines and correct governed VAT coding at source.",
    resolution: "Resolved only when every tax-bearing purchase line resolves to an active, effective VAT code.",
  },
  INPUT_POSTING: {
    title: "Restore purchase approval and posting evidence",
    action: "Approve/post the affected vendor invoices and ensure their exact linked journals remain POSTED and non-reversed.",
    resolution: "Resolved only when claimable input VAT is backed by an approved invoice and its valid linked journal.",
  },
  EXCHANGE_RATES: {
    title: "Supply governed FX evidence",
    action: "Add the missing real exchange rates to the affected foreign-currency source documents.",
    resolution: "Resolved only when every foreign-currency tax document has a valid rate into the functional currency.",
  },
  TAX_CALENDAR_AUTHORITY: {
    title: "Confirm statutory deadline authority",
    action: "Verify the filing deadline against authority evidence or record a controlled evidence-backed exception.",
    resolution: "Resolved only when the governed tax calendar or documented authority evidence supports the recorded filing deadline.",
  },
  CALCULATION_FRESHNESS: {
    title: "Recalculate from current evidence",
    action: "Recalculate the VAT return after all source evidence is current and valid.",
    resolution: "Resolved only when the stored calculation matches the current governed line-evidence method and source state.",
  },
  POTENTIAL_DUPLICATES: {
    title: "Review possible duplicate purchases",
    action: "Inspect the flagged supplier/invoice-number groups before filing.",
    resolution: "Clears when duplicate-risk evidence no longer exists or the underlying source documents are corrected.",
  },
  FILING_DEADLINE: {
    title: "Protect the filing deadline",
    action: "Prioritise the remaining blockers against the statutory filing deadline.",
    resolution: "This warning is informational; the filing date remains governed by the statutory calendar.",
  },
});

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function dateKey(value) {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function daysBetween(left, right) {
  const a = dateKey(left);
  const b = dateKey(right);
  if (!a || !b) return null;
  const delta = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Number.isFinite(delta) ? Math.round(delta / 86400000) : null;
}

function exceptionMatchesCheck(code, exceptionCode) {
  const check = upper(code);
  const item = upper(exceptionCode);
  if (!item) return false;
  if (check === "OUTPUT_CODING") return item.startsWith("OUTPUT_TAX_") || item === "OUTPUT_VAT_RULE_NOT_EFFECTIVE";
  if (check === "OUTPUT_POSTING") return item === "OUTPUT_NOT_POSTED" || item === "OUTPUT_POSTING_REVERSED";
  if (check === "INPUT_CODING") return item.startsWith("INPUT_TAX_") || item === "INPUT_VAT_RULE_NOT_EFFECTIVE";
  if (check === "INPUT_POSTING") return item === "INPUT_NOT_APPROVED_POSTED" || item === "INPUT_POSTING_REVERSED";
  if (check === "EXCHANGE_RATES") return item.endsWith("EXCHANGE_RATE_MISSING");
  if (check === "POTENTIAL_DUPLICATES") return item === "POTENTIAL_DUPLICATE_VENDOR_INVOICE";
  return false;
}

function priorityFor({ blocking, overdue, daysRemaining, code }) {
  if (overdue) return 0;
  if (code === "CALCULATION_FRESHNESS") return 1;
  if (Number.isFinite(daysRemaining) && daysRemaining <= 3) return blocking ? 1 : 2;
  if (Number.isFinite(daysRemaining) && daysRemaining <= 7) return blocking ? 2 : 4;
  return blocking ? 3 : 7;
}

export function deriveFinanceTaxCloseGuidance(preflight) {
  if (!preflight?.return) return null;

  const returnId = preflight.return.id;
  const returnStatus = upper(preflight.return.status);
  const filingDueDate = dateKey(preflight?.due?.filing_due_date || preflight.return.filing_due_date);
  const legalDate = dateKey(preflight?.due?.legal_date) || new Date().toISOString().slice(0, 10);
  const daysRemaining = filingDueDate ? daysBetween(legalDate, filingDueDate) : null;
  const overdue = Number.isFinite(daysRemaining) ? daysRemaining < 0 : false;
  const exceptions = Array.isArray(preflight?.evidence?.exceptions) ? preflight.evidence.exceptions : [];
  const checks = Array.isArray(preflight.checks) ? preflight.checks : [];

  if (returnStatus === "SUBMITTED") {
    return {
      state: "FILED",
      filing_due_date: filingDueDate,
      legal_date: legalDate,
      days_remaining: daysRemaining,
      dependencies: [],
      next: null,
      counts: { total: 0, blocking: 0, warnings: 0, client_evidence: 0, accountant: 0 },
      truth_rule: "Submitted filing evidence is immutable. Settlement and bank reconciliation own the remaining post-filing controls.",
    };
  }

  const dependencies = checks
    .filter(item => {
      const code = upper(item?.code);
      const status = upper(item?.status);
      return (BLOCKING_CHECKS.has(code) && status === "BLOCK") || (WARNING_CHECKS.has(code) && status === "WARNING");
    })
    .map(item => {
      const code = upper(item.code);
      const blocking = upper(item.status) === "BLOCK";
      const clientEvidence = CLIENT_EVIDENCE_CHECKS.has(code);
      const action = ACTIONS[code] || {
        title: item.label || code,
        action: item.detail || "Review the governed Tax evidence.",
        resolution: "Resolved only when the live Tax preflight no longer reports this dependency.",
      };
      const evidence = exceptions.filter(row => exceptionMatchesCheck(code, row?.code));
      return {
        id: `VAT:${returnId}:${code}`,
        code,
        title: action.title,
        detail: item.detail || null,
        next_action: action.action,
        resolution_rule: action.resolution,
        truth_state: blocking ? "OPEN_BLOCKER" : "OPEN_WARNING",
        blocking,
        priority: priorityFor({ blocking, overdue, daysRemaining, code }),
        responsibility: clientEvidence ? "CLIENT_EVIDENCE_ACCOUNTANT_VALIDATION" : "ACCOUNTANT",
        owner_role: clientEvidence ? "CLIENT_RELATIONSHIP" : "PREPARER",
        client_request_recommended: clientEvidence,
        communication_mode: clientEvidence ? "DRAFT_OR_GOVERNED_REQUEST_ONLY" : "NONE",
        filing_due_date: filingDueDate,
        days_remaining: daysRemaining,
        evidence_count: Math.max(Number(item.count || 0), evidence.length),
        evidence_preview: evidence.slice(0, 5).map(row => ({
          code: row.code,
          source_type: row.source_type,
          source_id: row.source_id,
          reference: row.reference,
          date: row.date,
          detail: row.detail,
        })),
        manual_complete_allowed: false,
      };
    })
    .sort((a, b) => a.priority - b.priority || Number(b.blocking) - Number(a.blocking) || a.title.localeCompare(b.title));

  const blockingCount = dependencies.filter(item => item.blocking).length;
  const warningCount = dependencies.length - blockingCount;
  const clientCount = dependencies.filter(item => item.responsibility === "CLIENT_EVIDENCE_ACCOUNTANT_VALIDATION").length;

  return {
    state: blockingCount ? "BLOCKED" : preflight.ready_to_submit ? "READY_TO_FILE" : preflight.ready_to_calculate ? "READY_TO_CALCULATE" : "IN_PROGRESS",
    filing_due_date: filingDueDate,
    legal_date: legalDate,
    days_remaining: daysRemaining,
    overdue,
    dependencies,
    next: dependencies[0] || null,
    counts: {
      total: dependencies.length,
      blocking: blockingCount,
      warnings: warningCount,
      client_evidence: clientCount,
      accountant: dependencies.length - clientCount,
    },
    truth_rule: "Dependencies are derived from live Tax evidence. A human cannot mark them complete while the underlying accounting or authority condition still fails.",
    communication_rule: "Avantiqo may prepare a request or reminder, but this guidance never sends client communication automatically.",
  };
}
