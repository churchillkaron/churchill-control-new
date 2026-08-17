export const BILLING_POLICIES = {
  PREPAID: "PREPAID",
  MONTHLY_INVOICE: "MONTHLY_INVOICE",
};

export const WALLET_STATUS = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  CLOSED: "CLOSED",
};

function currencyCode(value) {
  const currency = String(value || "").trim().toUpperCase();
  if (!currency) throw new Error("ORGANIZATION_WALLET_CURRENCY_REQUIRED");
  return currency;
}

// A wallet amount that cannot be parsed is refused rather than stored as NaN.
//
// Number("not a number") is NaN, and NaN is the worst possible value to hold in a balance: it survives every
// arithmetic operation downstream, and it compares false against every threshold. So a NaN balance passes an
// "is there enough to reserve?" check by failing it, silently, and renders as a blank cell rather than an
// error. Nothing about the failure looks like a failure until somebody reconciles.
//
// Absent stays zero, because a wallet created without a balance genuinely has none, and numeric strings still
// parse so values arriving from JSON keep working. Only a value that is present and meaningless throws, and
// that case has no reading worth preserving.
function walletAmount(value, field) {
  if (value === null || value === undefined || value === "") return 0;
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    throw new Error(`ORGANIZATION_WALLET_AMOUNT_INVALID:${field}`);
  }
  return amount;
}

export function createOrganizationWallet(data = {}) {
  const now = new Date().toISOString();

  return {
    id: data.id || crypto.randomUUID(),
    organization_id: data.organization_id,
    currency: currencyCode(data.currency),
    available_balance: walletAmount(data.available_balance, "available_balance"),
    reserved_balance: walletAmount(data.reserved_balance, "reserved_balance"),
    billing_policy:
      data.billing_policy ||
      BILLING_POLICIES.PREPAID,
    auto_topup: Boolean(data.auto_topup),
    auto_topup_threshold: walletAmount(data.auto_topup_threshold, "auto_topup_threshold"),
    auto_topup_amount: walletAmount(data.auto_topup_amount, "auto_topup_amount"),
    status:
      data.status ||
      WALLET_STATUS.ACTIVE,
    created_at: data.created_at || now,
    updated_at: now,
  };
}
