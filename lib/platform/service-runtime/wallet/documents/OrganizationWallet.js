export const BILLING_POLICIES = {
  PREPAID: "PREPAID",
  MONTHLY_INVOICE: "MONTHLY_INVOICE",
};

export const WALLET_STATUS = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  CLOSED: "CLOSED",
};

export function createOrganizationWallet(data = {}) {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),

    organization_id: data.organization_id,

    currency: data.currency || "USD",

    available_balance: Number(data.available_balance || 0),
    reserved_balance: Number(data.reserved_balance || 0),

    billing_policy:
      data.billing_policy ||
      BILLING_POLICIES.PREPAID,

    auto_topup:
      Boolean(data.auto_topup),

    auto_topup_threshold:
      Number(data.auto_topup_threshold || 0),

    auto_topup_amount:
      Number(data.auto_topup_amount || 0),

    status:
      data.status ||
      WALLET_STATUS.ACTIVE,

    created_at: now,
    updated_at: now,
  };
}
