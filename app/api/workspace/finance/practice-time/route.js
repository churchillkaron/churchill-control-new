export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { loadCompletePracticeRows, loadCompletePracticeRowsByIds } from "@/lib/finance/practice/FinancePracticePopulation";
import { practiceBillingPolicyBlockers } from "@/lib/finance/practice/FinancePracticeBillingPolicyReadiness";

const MANAGE_PERMISSIONS = ["finance.accounting.manage", "finance.configuration.manage"];
const OPEN_ITEM_STATUSES = ["NOT_STARTED", "READY", "IN_PROGRESS", "WAITING_ON_CLIENT", "BLOCKED", "READY_FOR_REVIEW", "CHANGES_REQUESTED"];

function clean(value) { return String(value ?? "").trim(); }
function jsonError(error, status = 400) { return NextResponse.json({ success: false, error }, { status }); }
function money(value) { const n = Number(value); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function hours(minutes) { return Math.round((Number(minutes || 0) / 60) * 100) / 100; }

const EU_COUNTRIES = new Set(["AT","BE","BG","HR","CY","CZ","DE","DK","EE","ES","FI","FR","GR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK"]);
function normalizedCountry(value) { return clean(value).toUpperCase(); }
function regimeMatchesCountry(regime, country) {
  const normalizedRegime = clean(regime).toUpperCase();
  const normalized = normalizedCountry(country);
  if (!normalizedRegime || !normalized) return false;
  if (normalized === "TH") return ["TH", "THA", "THAILAND"].includes(normalizedRegime);
  if (EU_COUNTRIES.has(normalized)) return normalizedRegime === "EU" || normalizedRegime === normalized;
  return normalizedRegime === normalized;
}
function effectiveToday(rule, today = new Date().toISOString().slice(0, 10)) {
  return (!rule.effective_from || String(rule.effective_from).slice(0, 10) <= today) && (!rule.effective_to || String(rule.effective_to).slice(0, 10) >= today);
}
function salesTaxRule(rule) {
  const type = clean(rule.tax_type).toUpperCase();
  return type === "VAT" || type === "SALES_TAX" || type === "GST";
}
function dedupeBillingTaxRules(rules, accountingFirmId) {
  const sorted = [...(rules || [])].sort((a, b) => {
    const aLocal = String(a.organization_id || "") === String(accountingFirmId) ? 1 : 0;
    const bLocal = String(b.organization_id || "") === String(accountingFirmId) ? 1 : 0;
    if (aLocal !== bLocal) return bLocal - aLocal;
    const updated = String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""));
    return updated || String(a.id).localeCompare(String(b.id));
  });
  const seen = new Set();
  return sorted.filter((rule) => {
    const key = [clean(rule.tax_type).toUpperCase(), clean(rule.tax_regime).toUpperCase(), clean(rule.tax_code).toUpperCase(), Number(rule.tax_rate || 0)].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function requireView(access) {
  await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey: "finance.view", fullAccess: access.permissions?.includes("*") === true });
}
async function requireManage(access) {
  if (access.permissions?.includes("*") === true) return;
  let lastError = null;
  for (const permissionKey of MANAGE_PERMISSIONS) {
    try {
      await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey, fullAccess: false });
      return;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("Finance practice time permission denied");
}
function staffId(access) {
  return access?.access?.staffAccountId || access?.staff?.id || null;
}

async function loadContext(accountingFirmId) {
  const engagements = await loadCompletePracticeRows({
    label: "Accounting practice Time & WIP engagements",
    buildQuery: (from, to) => supabaseAdmin.from("accounting_engagements")
      .select("id,organization_id,entity_id,service_package,status")
      .eq("accounting_firm_id", accountingFirmId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  });
  const clientIds = [...new Set(engagements.map((row) => row.organization_id).filter(Boolean))];

  const [organizations, profiles, workItems, billingProfiles, billingEntities, customerParties, accounts, taxRules] = await Promise.all([
    clientIds.length ? loadCompletePracticeRowsByIds({
      ids: clientIds,
      label: "Accounting practice Time & WIP client organizations",
      buildQuery: (batch, from, to) => supabaseAdmin.from("organizations").select("id,name").in("id", batch).order("id", { ascending: true }).range(from, to),
    }) : Promise.resolve([]),
    loadCompletePracticeRows({
      label: "Accounting practice client profiles",
      buildQuery: (from, to) => supabaseAdmin.from("accounting_client_profiles")
        .select("organization_id,assigned_accountant_id,assigned_accountant_name,assigned_reviewer_id,assigned_reviewer_name,assigned_partner_id,assigned_partner_name")
        .eq("accounting_firm_id", accountingFirmId)
        .order("organization_id", { ascending: true })
        .range(from, to),
    }),
    loadCompletePracticeRows({
      label: "Accounting practice open work items",
      buildQuery: (from, to) => supabaseAdmin.from("accounting_engagement_work_items")
        .select("id,organization_id,entity_id,run_id,title,status,assigned_to,budget_minutes,due_at")
        .eq("accounting_firm_id", accountingFirmId)
        .in("status", OPEN_ITEM_STATUSES)
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, to),
    }),
    loadCompletePracticeRows({
      label: "Accounting practice billing profiles",
      buildQuery: (from, to) => supabaseAdmin.from("accounting_practice_billing_profiles")
        .select("id,organization_id,engagement_id,billing_method,currency_code,default_hourly_rate,fixed_fee_amount,billing_entity_id,customer_party_id,revenue_account_id,tax_rule_id,tax_rate_percent,tax_treatment_confirmed,payment_terms_days,billing_cadence,next_billing_date,status,updated_at")
        .eq("accounting_firm_id", accountingFirmId)
        .order("id", { ascending: true })
        .range(from, to),
    }),
    loadCompletePracticeRows({
      label: "Accounting firm billing entities",
      buildQuery: (from, to) => supabaseAdmin.from("legal_entities")
        .select("id,code,legal_name,display_name,country,currency,is_active,is_default_accounting_entity")
        .eq("organization_id", accountingFirmId)
        .eq("is_active", true)
        .order("is_default_accounting_entity", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    }),
    loadCompletePracticeRows({
      label: "Accounting firm billing customer parties",
      buildQuery: (from, to) => supabaseAdmin.from("parties")
        .select("id,display_name,legal_name,email,party_type,status")
        .eq("organization_id", accountingFirmId)
        .order("display_name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    }),
    loadCompletePracticeRows({
      label: "Accounting firm chart of accounts",
      buildQuery: (from, to) => supabaseAdmin.from("chart_of_accounts")
        .select("*")
        .eq("organization_id", accountingFirmId)
        .order("account_code", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    }),
    loadCompletePracticeRows({
      label: "Accounting firm billing tax rules",
      buildQuery: (from, to) => supabaseAdmin.from("tax_rules")
        .select("id,tax_code,tax_name,tax_type,tax_rate,tax_regime,effective_from,effective_to,is_active,organization_id,created_at,updated_at")
        .or(`organization_id.eq.${accountingFirmId},organization_id.is.null`)
        .eq("is_active", true)
        .order("tax_name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    }),
  ]);

  const billingCountries = [...new Set(billingEntities.map((row) => normalizedCountry(row.country)).filter(Boolean))];
  const filteredTaxRules = dedupeBillingTaxRules(
    taxRules.filter((rule) => salesTaxRule(rule) && effectiveToday(rule) && billingCountries.some((country) => regimeMatchesCountry(rule.tax_regime, country))),
    accountingFirmId,
  ).map((rule) => ({ ...rule, applicable_countries: billingCountries.filter((country) => regimeMatchesCountry(rule.tax_regime, country)) }));

  return {
    engagements, organizations, profiles, workItems, billingProfiles, billingEntities, customerParties,
    revenueAccounts: accounts.filter((row) => { const type = String(row.account_type || row.type || "").toUpperCase(); return type.includes("REVENUE") || type.includes("INCOME"); }),
    taxRules: filteredTaxRules,
  };
}

function buildSummary({ context, entries }) {
  const orgNames = new Map(context.organizations.map((row) => [row.id, row.name || "Client organization"]));
  const engagementById = new Map(context.engagements.map((row) => [row.id, row]));
  const billingByEngagement = new Map(context.billingProfiles.map((row) => [row.engagement_id, row]));
  const workItemById = new Map(context.workItems.map((row) => [row.id, row]));
  const clientMap = new Map();
  let totalMinutes = 0, billableMinutes = 0, unbilledValue = 0, unpricedMinutes = 0, approvedUnbilledMinutes = 0;

  for (const entry of entries) {
    if (entry.status === "VOID") continue;
    totalMinutes += Number(entry.minutes || 0);
    if (entry.billable) billableMinutes += Number(entry.minutes || 0);
    const isUnbilled = entry.billable && entry.status !== "BILLED";
    const pricedValue = isUnbilled && entry.billing_rate != null ? Number(entry.billing_rate || 0) * Number(entry.minutes || 0) / 60 : 0;
    if (isUnbilled && entry.billing_rate == null) unpricedMinutes += Number(entry.minutes || 0);
    if (isUnbilled && entry.status === "APPROVED") approvedUnbilledMinutes += Number(entry.minutes || 0);
    unbilledValue += pricedValue;
    const client = clientMap.get(entry.organization_id) || {
      organization_id: entry.organization_id,
      client_name: orgNames.get(entry.organization_id) || "Client organization",
      minutes: 0, billable_minutes: 0, approved_unbilled_minutes: 0, unbilled_value: 0, unpriced_minutes: 0, entries: 0,
    };
    client.minutes += Number(entry.minutes || 0);
    client.entries += 1;
    if (entry.billable) client.billable_minutes += Number(entry.minutes || 0);
    if (isUnbilled && entry.status === "APPROVED") client.approved_unbilled_minutes += Number(entry.minutes || 0);
    if (isUnbilled && entry.billing_rate == null) client.unpriced_minutes += Number(entry.minutes || 0);
    client.unbilled_value += pricedValue;
    clientMap.set(entry.organization_id, client);
  }

  const workItems = context.workItems.map((item) => {
    const actual = entries.filter((entry) => entry.work_item_id === item.id && entry.status !== "VOID").reduce((sum, entry) => sum + Number(entry.minutes || 0), 0);
    return {
      ...item,
      client_name: orgNames.get(item.organization_id) || "Client organization",
      actual_minutes: actual,
      budget_variance_minutes: actual - Number(item.budget_minutes || 0),
    };
  });

  const clients = [...clientMap.values()].map((row) => ({
    ...row,
    hours: hours(row.minutes), billable_hours: hours(row.billable_minutes), approved_unbilled_hours: hours(row.approved_unbilled_minutes),
    unpriced_hours: hours(row.unpriced_minutes), unbilled_value: money(row.unbilled_value),
    billing_ready: row.approved_unbilled_minutes > 0 && row.unpriced_minutes === 0,
  })).sort((a, b) => b.unbilled_value - a.unbilled_value || b.billable_minutes - a.billable_minutes || a.client_name.localeCompare(b.client_name));

  const engagementWip = context.engagements.map((engagement) => {
    const profile = billingByEngagement.get(engagement.id) || null;
    const scoped = entries.filter((entry) => entry.engagement_id === engagement.id && entry.status === "APPROVED" && entry.billable);
    const priced = scoped.filter((entry) => entry.billing_rate != null);
    const timeValue = priced.reduce((sum, entry) => sum + Number(entry.billing_rate || 0) * Number(entry.minutes || 0) / 60, 0);
    const fixedValue = ["FIXED_FEE", "HYBRID"].includes(profile?.billing_method) ? Number(profile?.fixed_fee_amount || 0) : 0;
    const unpriced = scoped.filter((entry) => entry.billing_rate == null);
    const amount = profile?.billing_method === "FIXED_FEE" ? fixedValue : profile?.billing_method === "HYBRID" ? fixedValue + timeValue : timeValue;
    const blockers = practiceBillingPolicyBlockers(profile);
    if (["TIME_AND_MATERIALS", "HYBRID"].includes(profile?.billing_method) && unpriced.length) blockers.push("Unpriced approved time");
    if (profile?.billing_method === "TIME_AND_MATERIALS" && !scoped.length) blockers.push("No approved WIP");
    if (profile?.billing_method === "NON_BILLABLE") blockers.push("Engagement is non-billable");
    return {
      engagement_id: engagement.id, organization_id: engagement.organization_id, client_name: orgNames.get(engagement.organization_id) || "Client organization",
      service_package: engagement.service_package || "Accounting engagement", billing_profile: profile, approved_hours: hours(scoped.reduce((sum, entry) => sum + Number(entry.minutes || 0), 0)),
      unpriced_hours: hours(unpriced.reduce((sum, entry) => sum + Number(entry.minutes || 0), 0)), unbilled_value: money(amount), blockers, invoice_ready: blockers.length === 0 && amount > 0,
    };
  }).sort((a, b) => Number(b.invoice_ready) - Number(a.invoice_ready) || b.unbilled_value - a.unbilled_value || a.client_name.localeCompare(b.client_name));

  return {
    totals: {
      hours: hours(totalMinutes), billable_hours: hours(billableMinutes), approved_unbilled_hours: hours(approvedUnbilledMinutes),
      unpriced_hours: hours(unpricedMinutes), unbilled_value: money(unbilledValue),
      utilization: totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 1000) / 10 : 0,
    },
    clients,
    engagement_wip: engagementWip,
    work_items: workItems,
    billing_profiles: context.billingProfiles,
    billing_options: { entities: context.billingEntities, customer_parties: context.customerParties, revenue_accounts: context.revenueAccounts, tax_rules: context.taxRules },
    engagement_context: context.engagements.map((engagement) => ({
      ...engagement,
      client_name: orgNames.get(engagement.organization_id) || "Client organization",
      billing_profile: billingByEngagement.get(engagement.id) || null,
    })),
    references: { engagementById: engagementById.size, workItemById: workItemById.size },
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireView(access);
    const [context, entries] = await Promise.all([
      loadContext(access.organizationId),
      loadCompletePracticeRows({
        label: "Accounting practice time entries",
        buildQuery: (from, to) => supabaseAdmin.from("accounting_practice_time_entries")
          .select("id,organization_id,entity_id,engagement_id,run_id,work_item_id,staff_account_id,work_date,minutes,billable,billing_rate,currency_code,description,status,approved_by,approved_at,billing_reference,billed_at,created_at,updated_at")
          .eq("accounting_firm_id", access.organizationId)
          .order("work_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      }),
    ]);
    return NextResponse.json({ success: true, ...buildSummary({ context, entries }), entries, viewer_staff_account_id: staffId(access), generated_at: new Date().toISOString() });
  } catch (error) {
    return jsonError(error?.message || "Unable to load practice time and WIP", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireView(access);
    const actorStaffId = staffId(access);
    if (!actorStaffId) return jsonError("A linked staff account is required to record accounting time", 409);

    if (body.action === "upsert_billing_profile") {
      await requireManage(access);
      const engagementId = clean(body.engagementId || body.engagement_id);
      const { data: engagement, error: engagementError } = await supabaseAdmin.from("accounting_engagements")
        .select("id,organization_id").eq("id", engagementId).eq("accounting_firm_id", access.organizationId).maybeSingle();
      if (engagementError) throw engagementError;
      if (!engagement) return jsonError("Accounting engagement not found", 404);
      const billingMethod = clean(body.billingMethod || body.billing_method || "TIME_AND_MATERIALS").toUpperCase();
      if (!["TIME_AND_MATERIALS","FIXED_FEE","HYBRID","NON_BILLABLE"].includes(billingMethod)) return jsonError("Unsupported billing method", 400);
      const hourlyRate = body.defaultHourlyRate == null && body.default_hourly_rate == null ? null : Number(body.defaultHourlyRate ?? body.default_hourly_rate);
      const fixedFee = body.fixedFeeAmount == null && body.fixed_fee_amount == null ? null : Number(body.fixedFeeAmount ?? body.fixed_fee_amount);
      if (hourlyRate != null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) return jsonError("Hourly rate must be zero or greater", 400);
      if (fixedFee != null && (!Number.isFinite(fixedFee) || fixedFee < 0)) return jsonError("Fixed fee must be zero or greater", 400);
      const billingEntityId = clean(body.billingEntityId || body.billing_entity_id);
      const customerPartyId = clean(body.customerPartyId || body.customer_party_id);
      const revenueAccountId = clean(body.revenueAccountId || body.revenue_account_id);
      const taxRuleId = clean(body.taxRuleId || body.tax_rule_id);
      let billingEntity = null;
      if (billingEntityId) {
        const { data: entity, error: entityError } = await supabaseAdmin.from("legal_entities").select("id,country").eq("id", billingEntityId).eq("organization_id", access.organizationId).eq("is_active", true).maybeSingle();
        if (entityError) throw entityError; if (!entity) return jsonError("Billing entity is outside the accounting firm", 403);
        billingEntity = entity;
      }
      if (customerPartyId) {
        const { data: party, error: partyError } = await supabaseAdmin.from("parties").select("id,status").eq("id", customerPartyId).eq("organization_id", access.organizationId).maybeSingle();
        if (partyError) throw partyError; if (!party) return jsonError("Billing customer party is outside the accounting firm", 403);
        if (String(party.status || "").toUpperCase() !== "ACTIVE") return jsonError("Selected Finance customer must be active", 409);
      }
      if (revenueAccountId) {
        const { data: account, error: accountError } = await supabaseAdmin.from("chart_of_accounts").select("id,account_type,is_active").eq("id", revenueAccountId).eq("organization_id", access.organizationId).maybeSingle();
        if (accountError) throw accountError;
        if (!account) return jsonError("Revenue account is outside the accounting firm", 403);
        if (account.is_active !== true) return jsonError("Selected revenue account must be active", 409);
        const type = String(account.account_type || "").toUpperCase();
        if (!type.includes("REVENUE") && !type.includes("INCOME")) return jsonError("Selected billing account must be a revenue/income account", 409);
      }
      if (taxRuleId) {
        if (!billingEntityId || !billingEntity) return jsonError("Choose the billing entity before selecting a tax rule", 409);
        const { data: taxRule, error: taxRuleError } = await supabaseAdmin.from("tax_rules")
          .select("id,tax_rate,tax_type,tax_regime,effective_from,effective_to,is_active,organization_id")
          .eq("id", taxRuleId)
          .or(`organization_id.eq.${access.organizationId},organization_id.is.null`)
          .eq("is_active", true)
          .maybeSingle();
        if (taxRuleError) throw taxRuleError;
        if (!taxRule || !salesTaxRule(taxRule) || !effectiveToday(taxRule) || !regimeMatchesCountry(taxRule.tax_regime, billingEntity.country)) {
          return jsonError("Selected tax rule does not apply to the billing entity jurisdiction and current effective date", 409);
        }
      }
      const currencyCode = clean(body.currencyCode || body.currency_code || "THB").toUpperCase();
      if (!/^[A-Z]{3}$/.test(currencyCode)) return jsonError("Billing currency must use a three-letter currency code", 400);
      const paymentTermsDays = Math.round(Number(body.paymentTermsDays ?? body.payment_terms_days ?? 0));
      if (!Number.isFinite(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 3650) return jsonError("Payment terms must be between 0 and 3650 days", 400);
      const billingCadence = clean(body.billingCadence || body.billing_cadence || "ON_DEMAND").toUpperCase();
      if (!["ON_DEMAND","MONTHLY","QUARTERLY","ANNUAL"].includes(billingCadence)) return jsonError("Unsupported billing cadence", 400);
      const nextBillingDate = clean(body.nextBillingDate || body.next_billing_date) || null;
      if (nextBillingDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextBillingDate)) return jsonError("Next billing date must use YYYY-MM-DD", 400);

      const { data: mutation, error: mutationError } = await supabaseAdmin.rpc("upsert_accounting_practice_billing_policy", {
        p_accounting_firm_id: access.organizationId,
        p_engagement_id: engagement.id,
        p_billing_method: billingMethod,
        p_currency_code: currencyCode,
        p_default_hourly_rate: hourlyRate,
        p_fixed_fee_amount: fixedFee,
        p_billing_entity_id: billingEntityId || null,
        p_customer_party_id: customerPartyId || null,
        p_revenue_account_id: revenueAccountId || null,
        p_tax_rule_id: taxRuleId || null,
        p_tax_treatment_confirmed: body.taxTreatmentConfirmed === true || body.tax_treatment_confirmed === true,
        p_payment_terms_days: paymentTermsDays,
        p_billing_cadence: billingCadence,
        p_next_billing_date: nextBillingDate,
        p_apply_rate_to_unpriced: body.applyRateToUnpriced === true,
        p_updated_by: actorStaffId,
      });
      if (mutationError) throw mutationError;
      const data = mutation?.billing_profile || null;
      if (!data?.id) throw new Error("Atomic billing policy mutation returned no billing profile");
      const repriced_entries = Number(mutation?.repriced_entries || 0);
      return NextResponse.json({ success: true, billing_profile: data, billing_policy_blockers: practiceBillingPolicyBlockers(data), repriced_entries });
    }

    const workItemId = clean(body.workItemId || body.work_item_id);
    const minutes = Math.round(Number(body.minutes || 0));
    if (!workItemId) return jsonError("Work item is required", 400);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) return jsonError("Time must be between 1 and 1440 minutes", 400);
    const { data: item, error: itemError } = await supabaseAdmin.from("accounting_engagement_work_items")
      .select("id,organization_id,entity_id,run_id,assigned_to,title").eq("id", workItemId).eq("accounting_firm_id", access.organizationId).maybeSingle();
    if (itemError) throw itemError;
    if (!item) return jsonError("Accounting work item not found", 404);
    const { data: run, error: runError } = await supabaseAdmin.from("accounting_engagement_runs")
      .select("id,engagement_id").eq("id", item.run_id).eq("accounting_firm_id", access.organizationId).maybeSingle();
    if (runError) throw runError;
    if (!run) return jsonError("Accounting run not found", 409);
    const { data: billingProfile, error: profileError } = await supabaseAdmin.from("accounting_practice_billing_profiles")
      .select("billing_method,currency_code,default_hourly_rate,status").eq("accounting_firm_id", access.organizationId).eq("engagement_id", run.engagement_id).eq("status", "ACTIVE").maybeSingle();
    if (profileError) throw profileError;
    const billable = body.billable !== false && billingProfile?.billing_method !== "NON_BILLABLE";
    const rate = billable && billingProfile?.default_hourly_rate != null ? Number(billingProfile.default_hourly_rate) : null;
    const { data, error } = await supabaseAdmin.from("accounting_practice_time_entries").insert({
      accounting_firm_id: access.organizationId, organization_id: item.organization_id, entity_id: item.entity_id,
      engagement_id: run.engagement_id, run_id: item.run_id, work_item_id: item.id, staff_account_id: actorStaffId,
      work_date: clean(body.workDate || body.work_date || new Date().toISOString().slice(0, 10)), minutes, billable,
      billing_rate: rate, currency_code: clean(billingProfile?.currency_code || "THB").toUpperCase(), description: clean(body.description) || null,
      status: "SUBMITTED", metadata: { source: "finance_practice_time", work_item_title: item.title },
    }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ success: true, time_entry: data }, { status: 201 });
  } catch (error) {
    return jsonError(error?.message || "Unable to record practice time", 500);
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);
    const actorStaffId = staffId(access);
    if (!actorStaffId) return jsonError("A linked staff account is required", 409);
    const entryId = clean(body.entryId || body.entry_id);
    const action = clean(body.action).toLowerCase();
    const { data: current, error: currentError } = await supabaseAdmin.from("accounting_practice_time_entries")
      .select("*").eq("id", entryId).eq("accounting_firm_id", access.organizationId).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return jsonError("Time entry not found", 404);
    if (action === "approve") {
      if (!["DRAFT","SUBMITTED"].includes(current.status)) return jsonError("Only draft or submitted time can be approved", 409);
      const { data, error } = await supabaseAdmin.from("accounting_practice_time_entries").update({ status: "APPROVED", approved_by: actorStaffId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", current.id).eq("accounting_firm_id", access.organizationId).select("*").single();
      if (error) throw error;
      return NextResponse.json({ success: true, time_entry: data });
    }
    if (action === "void") {
      if (current.status === "BILLED") return jsonError("Billed time cannot be voided; use the governed billing correction flow", 409);
      const { data, error } = await supabaseAdmin.from("accounting_practice_time_entries").update({ status: "VOID", updated_at: new Date().toISOString() }).eq("id", current.id).eq("accounting_firm_id", access.organizationId).select("*").single();
      if (error) throw error;
      return NextResponse.json({ success: true, time_entry: data });
    }
    return jsonError("Unsupported time-entry action", 400);
  } catch (error) {
    return jsonError(error?.message || "Unable to update practice time", 500);
  }
}
