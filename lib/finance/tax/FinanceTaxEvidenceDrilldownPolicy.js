export const FINANCE_TAX_EVIDENCE_DRILLDOWN_CONTRACT = "FINANCE_TAX_EVIDENCE_DRILLDOWN_V1";
export const FINANCE_TAX_EVIDENCE_RESOLUTION_AUTHORITY = "LIVE_TAX_PREFLIGHT_ONLY";

const CONFIG_DEPENDENCIES = new Set([
  "REGISTRATION_REFERENCE",
  "VAT_RULES",
  "TAX_CALENDAR_AUTHORITY",
  "CALCULATION_FRESHNESS",
  "FILING_DEADLINE",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function upper(value) {
  return text(value, 240).toUpperCase();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function financeTaxExceptionMatchesDependency(dependencyCode, exceptionCode) {
  const dependency = upper(dependencyCode);
  const exception = upper(exceptionCode);
  if (!dependency || !exception) return false;
  if (dependency === "OUTPUT_CODING") return exception.startsWith("OUTPUT_TAX_") || exception === "OUTPUT_VAT_RULE_NOT_EFFECTIVE";
  if (dependency === "OUTPUT_POSTING") return exception === "OUTPUT_NOT_POSTED" || exception === "OUTPUT_POSTING_REVERSED";
  if (dependency === "INPUT_CODING") return exception.startsWith("INPUT_TAX_") || exception === "INPUT_VAT_RULE_NOT_EFFECTIVE";
  if (dependency === "INPUT_POSTING") return exception === "INPUT_NOT_APPROVED_POSTED" || exception === "INPUT_POSTING_REVERSED";
  if (dependency === "EXCHANGE_RATES") return exception.endsWith("EXCHANGE_RATE_MISSING");
  if (dependency === "POTENTIAL_DUPLICATES") return exception === "POTENTIAL_DUPLICATE_VENDOR_INVOICE";
  return false;
}

function checkFor(preflight, code) {
  return list(preflight?.checks).find(item => upper(item?.code) === upper(code)) || null;
}

function syntheticEvidenceFor(preflight, dependencyCode) {
  const code = upper(dependencyCode);
  const row = preflight?.return || {};
  const check = checkFor(preflight, code);

  if (code === "REGISTRATION_REFERENCE") {
    return [{
      code,
      severity: "BLOCK",
      source_type: "REGISTRATION_CONTEXT",
      source_id: preflight?.entity?.id || row.entity_id || null,
      reference: preflight?.entity?.legal_name || preflight?.entity?.code || "Legal entity registration",
      date: null,
      detail: check?.detail || "VAT registration evidence requires review.",
      amount: null,
    }];
  }

  if (code === "VAT_RULES") {
    return [{
      code,
      severity: "BLOCK",
      source_type: "VAT_RULE_CONTEXT",
      source_id: row.jurisdiction_code || null,
      reference: row.jurisdiction_code || "VAT rule set",
      date: row.period_end || null,
      detail: check?.detail || "VAT rule coverage requires review.",
      amount: null,
    }];
  }

  if (code === "TAX_CALENDAR_AUTHORITY" || code === "FILING_DEADLINE") {
    return [{
      code,
      severity: upper(check?.status) === "BLOCK" ? "BLOCK" : "WARNING",
      source_type: "TAX_CALENDAR_CONTEXT",
      source_id: row.id || null,
      reference: row.filing_due_date || "Statutory filing deadline",
      date: row.filing_due_date || null,
      detail: check?.detail || "Statutory calendar evidence requires review.",
      amount: null,
    }];
  }

  if (code === "CALCULATION_FRESHNESS") {
    return [{
      code,
      severity: "BLOCK",
      source_type: "VAT_CALCULATION_CONTEXT",
      source_id: row.id || null,
      reference: row.return_number || row.id || "VAT calculation",
      date: preflight?.calculated?.at || null,
      detail: check?.detail || "VAT calculation freshness requires review.",
      amount: null,
    }];
  }

  return [];
}

function normalizeIssue(row) {
  return {
    code: upper(row?.code),
    severity: upper(row?.severity || "BLOCK"),
    source_type: upper(row?.source_type || "CONFIG"),
    source_id: text(row?.source_id, 240) || null,
    reference: text(row?.reference, 500) || null,
    date: text(row?.date, 40) || null,
    detail: text(row?.detail, 1800) || null,
    amount: row?.amount == null ? null : Number(row.amount),
  };
}

export function buildFinanceTaxEvidenceIssuePage({
  preflight,
  guidance,
  dependencyCode,
  offset = 0,
  limit = 25,
} = {}) {
  const code = upper(dependencyCode);
  const dependency = list(guidance?.dependencies).find(item => upper(item?.code) === code) || null;
  if (!dependency) throw new Error("Tax dependency is no longer active in live accounting truth");

  const safeOffset = boundedInteger(offset, 0, 0, 250000);
  const safeLimit = boundedInteger(limit, 25, 1, 50);
  const exceptionWindow = list(preflight?.evidence?.exceptions)
    .filter(item => financeTaxExceptionMatchesDependency(code, item?.code))
    .map(normalizeIssue);
  const synthetic = CONFIG_DEPENDENCIES.has(code) ? syntheticEvidenceFor(preflight, code).map(normalizeIssue) : [];
  const available = exceptionWindow.length ? exceptionWindow : synthetic;
  const declaredTotal = Math.max(Number(dependency.evidence_count || 0), available.length);
  const populationTotal = synthetic.length ? synthetic.length : declaredTotal;
  const page = available.slice(safeOffset, safeOffset + safeLimit);
  const complete = synthetic.length > 0 || available.length >= declaredTotal;

  return {
    contract: FINANCE_TAX_EVIDENCE_DRILLDOWN_CONTRACT,
    dependency: {
      id: dependency.id,
      code: dependency.code,
      title: dependency.title,
      detail: dependency.detail,
      next_action: dependency.next_action,
      resolution_rule: dependency.resolution_rule,
      blocking: dependency.blocking === true,
      responsibility: dependency.responsibility,
      manual_complete_allowed: false,
    },
    issues: page,
    population: {
      total: populationTotal,
      available_in_live_preflight_window: available.length,
      offset: safeOffset,
      limit: safeLimit,
      returned: page.length,
      has_more_available: safeOffset + page.length < available.length,
      has_more_population: safeOffset + page.length < populationTotal,
      complete,
      preflight_window_truncated: preflight?.evidence?.exceptions_truncated === true,
    },
    resolution_authority: FINANCE_TAX_EVIDENCE_RESOLUTION_AUTHORITY,
    mutation_authority: false,
  };
}
