function clean(value) {
  return String(value ?? "").trim();
}

export function practiceBillingPolicyBlockers(profile) {
  if (!profile) return ["Billing policy missing"];

  const method = clean(profile.billing_method || "TIME_AND_MATERIALS").toUpperCase();
  const cadence = clean(profile.billing_cadence || "ON_DEMAND").toUpperCase();
  const blockers = [];

  if (method === "NON_BILLABLE") return blockers;

  if (!profile.billing_entity_id) blockers.push("Billing entity missing");
  if (!profile.customer_party_id) blockers.push("Finance customer missing");
  if (!profile.revenue_account_id) blockers.push("Revenue account missing");
  if (!profile.tax_rule_id) blockers.push("Tax rule missing");
  if (profile.tax_treatment_confirmed !== true) blockers.push("Tax treatment not confirmed");

  if (["TIME_AND_MATERIALS", "HYBRID"].includes(method)) {
    const rate = Number(profile.default_hourly_rate);
    if (profile.default_hourly_rate == null || !Number.isFinite(rate) || rate <= 0) blockers.push("Default hourly rate missing");
  }

  if (["FIXED_FEE", "HYBRID"].includes(method)) {
    const fixedFee = Number(profile.fixed_fee_amount);
    if (!Number.isFinite(fixedFee) || fixedFee <= 0) blockers.push("Fixed fee missing");
  }

  if (cadence !== "ON_DEMAND" && !profile.next_billing_date) blockers.push("Next billing date missing");

  return blockers;
}

export function practiceBillingPolicyReady(profile) {
  return practiceBillingPolicyBlockers(profile).length === 0;
}
