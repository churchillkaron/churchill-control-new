const POLICIES = Object.freeze({
  TH: {
    country_code: "TH",
    country_name: "Thailand",
    currency: "THB",
    accounting_standard: "TFRS",
    timezone: "Asia/Bangkok",
    locale: "th-TH",
    tax_regime: "THAILAND",
    fiscal_year_start_month: 1,
    fiscal_year_start_day: 1,
    fiscal_year_end_month: 12,
    fiscal_year_end_day: 31,
    withholding_tax_enabled: true,
    vat_rate: 0.07,
    vat_rate_valid_through: "2027-09-30",
    vat_rate_source: "THAILAND_REVENUE_DEPARTMENT_RD_807_2569",
    automated: true,
  },
});

function text(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function resolveOnboardingJurisdictionPolicy(countryCode) {
  const code = text(countryCode);
  const policy = POLICIES[code] || null;
  if (policy) {
    const validThrough = policy.vat_rate_valid_through ? new Date(`${policy.vat_rate_valid_through}T23:59:59Z`) : null;
    const expired = validThrough ? Date.now() > validThrough.getTime() : false;
    return {
      ...policy,
      automated: expired ? false : policy.automated,
      supported: true,
      requires_review: expired,
      review_reason: expired ? "VAT_RATE_POLICY_EXPIRED" : null,
    };
  }
  return {
    country_code: code || null,
    country_name: null,
    currency: null,
    accounting_standard: null,
    tax_regime: "UNCONFIGURED",
    fiscal_year_start_month: 1,
    fiscal_year_start_day: 1,
    fiscal_year_end_month: 12,
    fiscal_year_end_day: 31,
    withholding_tax_enabled: false,
    automated: false,
    supported: false,
    requires_review: true,
  };
}

export function normalizeTaxRegistrationStatus(value) {
  const normalized = text(value);
  if (["REGISTERED", "YES", "TRUE"].includes(normalized)) return "REGISTERED";
  if (["NOT_REGISTERED", "NO", "FALSE"].includes(normalized)) return "NOT_REGISTERED";
  return "UNKNOWN";
}
