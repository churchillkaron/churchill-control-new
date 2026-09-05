const REQUIRED_VAT_CALCULATION_METHOD = "POSTED_GOVERNED_VAT_LINE_EVIDENCE_V2";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

export function applyFinanceVatCalculationMethodToPreflight(preflight) {
  if (!preflight) return preflight;
  if (upper(preflight?.return?.status) !== "CALCULATED") return preflight;

  const storedMethod = text(preflight?.return?.calculation?.method);
  if (storedMethod === REQUIRED_VAT_CALCULATION_METHOD) return preflight;

  const freshnessReason = storedMethod
    ? `calculation method changed from ${storedMethod} to ${REQUIRED_VAT_CALCULATION_METHOD}`
    : `calculation method is missing; current method is ${REQUIRED_VAT_CALCULATION_METHOD}`;
  const freshnessCheck = {
    code: "CALCULATION_FRESHNESS",
    label: "Calculation freshness",
    status: "BLOCK",
    detail: "Recalculate before filing: the stored VAT calculation was not produced by the current governed line-evidence method.",
    count: 1,
    blocks_calculation: false,
    blocks_submission: true,
  };
  const checks = [
    ...(Array.isArray(preflight.checks)
      ? preflight.checks.filter(item => item?.code !== "CALCULATION_FRESHNESS")
      : []),
    freshnessCheck,
  ];
  const submissionBlockers = [
    freshnessCheck,
    ...(Array.isArray(preflight.submission_blockers)
      ? preflight.submission_blockers.filter(item => item?.code !== "CALCULATION_FRESHNESS")
      : []),
  ];
  const existingReasons = Array.isArray(preflight?.calculated?.freshness_reasons)
    ? preflight.calculated.freshness_reasons
    : [];

  return {
    ...preflight,
    state: "NEEDS_ATTENTION",
    ready_to_submit: false,
    calculation_stale: true,
    checks,
    submission_blockers: submissionBlockers,
    calculated: {
      ...(preflight.calculated || {}),
      freshness_reasons: [...new Set([...existingReasons, freshnessReason])],
    },
  };
}

export const FINANCE_VAT_CALCULATION_METHOD = REQUIRED_VAT_CALCULATION_METHOD;
