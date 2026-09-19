import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { loadCompletePracticeRowsByIds } from "@/lib/finance/practice/FinancePracticePopulation";

const EU_COUNTRIES = new Set(["AT","BE","BG","HR","CY","CZ","DE","DK","EE","ES","FI","FR","GR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK"]);
const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

function regimeMatchesCountry(regime, country) {
  const normalizedRegime = upper(regime);
  const normalizedCountry = upper(country);
  if (!normalizedRegime || !normalizedCountry) return false;
  if (normalizedCountry === "TH") return ["TH", "THA", "THAILAND"].includes(normalizedRegime);
  if (EU_COUNTRIES.has(normalizedCountry)) return normalizedRegime === "EU" || normalizedRegime === normalizedCountry;
  return normalizedRegime === normalizedCountry;
}

function effectiveToday(rule, today) {
  return (!rule.effective_from || String(rule.effective_from).slice(0, 10) <= today)
    && (!rule.effective_to || String(rule.effective_to).slice(0, 10) >= today);
}

function salesTaxRule(rule) {
  return ["VAT", "SALES_TAX", "GST"].includes(upper(rule.tax_type));
}

export async function loadPracticeBillingReferenceBlockers({ accountingFirmId, profiles = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  const activeProfiles = (profiles || []).filter((profile) => upper(profile?.status || "ACTIVE") === "ACTIVE" && upper(profile?.billing_method) !== "NON_BILLABLE");
  const entityIds = [...new Set(activeProfiles.map((row) => row.billing_entity_id).filter(Boolean))];
  const partyIds = [...new Set(activeProfiles.map((row) => row.customer_party_id).filter(Boolean))];
  const accountIds = [...new Set(activeProfiles.map((row) => row.revenue_account_id).filter(Boolean))];
  const taxRuleIds = [...new Set(activeProfiles.map((row) => row.tax_rule_id).filter(Boolean))];

  const [entities, parties, accounts, taxRules] = await Promise.all([
    entityIds.length ? loadCompletePracticeRowsByIds({
      ids: entityIds,
      label: "Practice billing live legal entities",
      buildQuery: (batch, from, to) => supabaseAdmin.from("legal_entities")
        .select("id,organization_id,country,is_active")
        .in("id", batch)
        .eq("organization_id", accountingFirmId)
        .eq("is_active", true)
        .order("id", { ascending: true })
        .range(from, to),
    }) : Promise.resolve([]),
    partyIds.length ? loadCompletePracticeRowsByIds({
      ids: partyIds,
      label: "Practice billing live customer parties",
      buildQuery: (batch, from, to) => supabaseAdmin.from("parties")
        .select("id,organization_id,status")
        .in("id", batch)
        .eq("organization_id", accountingFirmId)
        .order("id", { ascending: true })
        .range(from, to),
    }) : Promise.resolve([]),
    accountIds.length ? loadCompletePracticeRowsByIds({
      ids: accountIds,
      label: "Practice billing live revenue accounts",
      buildQuery: (batch, from, to) => supabaseAdmin.from("chart_of_accounts")
        .select("id,organization_id,account_type,is_active")
        .in("id", batch)
        .eq("organization_id", accountingFirmId)
        .eq("is_active", true)
        .order("id", { ascending: true })
        .range(from, to),
    }) : Promise.resolve([]),
    taxRuleIds.length ? loadCompletePracticeRowsByIds({
      ids: taxRuleIds,
      label: "Practice billing live tax rules",
      buildQuery: (batch, from, to) => supabaseAdmin.from("tax_rules")
        .select("id,organization_id,tax_type,tax_regime,effective_from,effective_to,is_active")
        .in("id", batch)
        .or(`organization_id.eq.${accountingFirmId},organization_id.is.null`)
        .eq("is_active", true)
        .order("id", { ascending: true })
        .range(from, to),
    }) : Promise.resolve([]),
  ]);

  const entityMap = new Map(entities.map((row) => [row.id, row]));
  const partyMap = new Map(parties.filter((row) => upper(row.status) === "ACTIVE").map((row) => [row.id, row]));
  const accountMap = new Map(accounts.filter((row) => {
    const type = upper(row.account_type);
    return type.includes("REVENUE") || type.includes("INCOME");
  }).map((row) => [row.id, row]));
  const taxMap = new Map(taxRules.map((row) => [row.id, row]));

  const result = new Map();
  for (const profile of profiles || []) {
    if (upper(profile?.billing_method) === "NON_BILLABLE") {
      result.set(profile.id, []);
      continue;
    }
    const blockers = [];
    const entity = profile.billing_entity_id ? entityMap.get(profile.billing_entity_id) : null;
    if (profile.billing_entity_id && !entity) blockers.push("Billing entity is no longer active");
    if (profile.customer_party_id && !partyMap.has(profile.customer_party_id)) blockers.push("Finance customer is no longer active");
    if (profile.revenue_account_id && !accountMap.has(profile.revenue_account_id)) blockers.push("Revenue account is no longer active or is not revenue");
    if (profile.tax_rule_id) {
      const rule = taxMap.get(profile.tax_rule_id);
      if (!rule || !salesTaxRule(rule) || !effectiveToday(rule, today) || !entity || !regimeMatchesCountry(rule.tax_regime, entity.country)) {
        blockers.push("Tax rule is no longer valid for the billing entity");
      }
    }
    result.set(profile.id, blockers);
  }
  return result;
}
