export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { buildFxRevaluationPlan, normalizeFxAccountIds } from "@/lib/finance/currencies/FinanceFxRevaluationPlan";

const ELIGIBLE_ACCOUNT_TYPES = ["ASSET", "CURRENT_ASSET", "CASH", "LIABILITY"];

function text(value) {
  return String(value ?? "").trim();
}

function required(value, field) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  const normalized = text(message);
  if (/permission denied|authentication|membership/i.test(normalized)) return 403;
  if (/required|not found|invalid|inactive|account|rate|currency|scope|revaluation|historical/i.test(normalized)) return 400;
  return 500;
}

async function authorize(request, operation) {
  const url = new URL(request.url);
  let body = null;
  if (request.method !== "GET") body = await request.json();
  const organizationId = body?.organizationId || body?.organization_id || url.searchParams.get("organizationId") || url.searchParams.get("organization_id");
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { response: NextResponse.json({ success: false, error: access.error }, { status: access.status }) };

  await requireFinanceWorkspacePermission({ capabilityId: "fx_revaluation", operation, access });
  return { access, body, url };
}

async function entityContext(organizationId, entityId) {
  const { data: entity, error: entityError } = await supabaseAdmin
    .from("legal_entities")
    .select("id,legal_name,name,currency,is_active")
    .eq("organization_id", organizationId)
    .eq("id", entityId)
    .maybeSingle();
  if (entityError) throw entityError;
  if (!entity || entity.is_active === false) throw new Error("FX Revaluation Legal Entity not found in organisation");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("finance_organization_profiles")
    .select("functional_currency,base_currency,reporting_currency,status")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (profileError && !["42P01", "PGRST204", "PGRST205"].includes(String(profileError.code || ""))) throw profileError;

  return {
    id: entity.id,
    name: entity.legal_name || entity.name || "Legal Entity",
    functional_currency: text(profile?.functional_currency || profile?.base_currency || profile?.reporting_currency || entity.currency).toUpperCase() || null,
  };
}

async function loadWorkspaceData({ organizationId, entityId }) {
  const [entity, accountResult, rateResult, runResult] = await Promise.all([
    entityContext(organizationId, entityId),
    supabaseAdmin
      .from("chart_of_accounts")
      .select("id,account_code,account_name,account_category,account_type,normal_balance,currency_code,is_active")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .order("account_code", { ascending: true }),
    supabaseAdmin
      .from("finance_exchange_rates")
      .select("id,entity_id,base_currency,quote_currency,from_currency,to_currency,rate,effective_date,source,rate_type,status")
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE")
      .order("effective_date", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("finance_fx_revaluation_runs")
      .select("id,period_id,revaluation_date,currency_code,rate_source,status,account_ids,closing_exchange_rate,functional_currency,journal_entry_id,total_adjustment,completed_at,created_at,updated_at,notes,unrealized_gain_account_id,unrealized_loss_account_id")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .order("revaluation_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  if (accountResult.error) throw accountResult.error;
  if (rateResult.error) throw rateResult.error;
  if (runResult.error) throw runResult.error;

  const allAccounts = accountResult.data || [];
  const eligibleAccounts = allAccounts.filter(account => ELIGIBLE_ACCOUNT_TYPES.includes(text(account.account_type).toUpperCase()));
  const accountMap = new Map(allAccounts.map(account => [String(account.id), account]));
  const functionalCurrency = entity.functional_currency;

  const applicableRates = (rateResult.data || []).filter(rate => !rate.entity_id || String(rate.entity_id) === String(entityId));
  const currencies = new Set();
  for (const rate of applicableRates) {
    const base = text(rate.base_currency || rate.from_currency).toUpperCase();
    const quote = text(rate.quote_currency || rate.to_currency).toUpperCase();
    if (base && base !== functionalCurrency) currencies.add(base);
    if (quote && quote !== functionalCurrency) currencies.add(quote);
  }
  for (const account of eligibleAccounts) {
    const code = text(account.currency_code).toUpperCase();
    if (code && code !== functionalCurrency) currencies.add(code);
  }

  const journalIds = [...new Set((runResult.data || []).map(run => run.journal_entry_id).filter(Boolean))];
  let journalMap = new Map();
  if (journalIds.length) {
    const { data: journals, error: journalError } = await supabaseAdmin
      .from("journal_entries")
      .select("id,status,reversed,reversal_status,reversal_journal_id,reversed_journal_entry_id,reversed_at,reversal_reason,posting_date,reference")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .in("id", journalIds);
    if (journalError) throw journalError;
    journalMap = new Map((journals || []).map(journal => [String(journal.id), journal]));
  }

  const runs = (runResult.data || []).map(run => {
    const selectedIds = Array.isArray(run.account_ids) ? run.account_ids.map(item => text(item?.account_id || item)).filter(Boolean) : [];
    const journal = run.journal_entry_id ? journalMap.get(String(run.journal_entry_id)) || null : null;
    return {
      ...run,
      selected_account_count: selectedIds.length,
      selected_accounts: selectedIds.map(id => accountMap.get(id)).filter(Boolean).map(account => ({
        id: account.id,
        account_code: account.account_code,
        account_name: account.account_name,
        account_type: account.account_type,
      })),
      gain_account: accountMap.get(String(run.unrealized_gain_account_id)) || null,
      loss_account: accountMap.get(String(run.unrealized_loss_account_id)) || null,
      journal,
    };
  });

  return {
    entity,
    accounts: eligibleAccounts,
    posting_accounts: allAccounts,
    rates: applicableRates,
    currencies: [...currencies].sort(),
    runs,
  };
}

export async function GET(request) {
  try {
    const auth = await authorize(request, "read");
    if (auth.response) return auth.response;
    const { access, url } = auth;
    const entityId = required(url.searchParams.get("entityId") || url.searchParams.get("entity_id"), "entity_id");

    if (url.searchParams.get("preview") === "1") {
      const accountIds = text(url.searchParams.get("accountIds") || url.searchParams.get("account_ids"))
        .split(",")
        .map(value => value.trim())
        .filter(Boolean);
      const plan = await buildFxRevaluationPlan({
        organizationId: access.organizationId,
        entityId,
        revaluationDate: required(url.searchParams.get("revaluationDate") || url.searchParams.get("revaluation_date"), "revaluation_date"),
        currencyCode: required(url.searchParams.get("currencyCode") || url.searchParams.get("currency_code"), "currency_code"),
        accountIds,
        excludeRunId: url.searchParams.get("runId") || url.searchParams.get("run_id") || null,
      });
      return NextResponse.json({ success: true, plan });
    }

    const workspace = await loadWorkspaceData({ organizationId: access.organizationId, entityId });
    return NextResponse.json({ success: true, ...workspace });
  } catch (error) {
    const message = error?.message || "FX Revaluation workspace load failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}

export async function POST(request) {
  try {
    const auth = await authorize(request, "write");
    if (auth.response) return auth.response;
    const { access, body } = auth;
    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const revaluationDate = required(body.revaluationDate || body.revaluation_date, "revaluation_date").slice(0, 10);
    const currencyCode = required(body.currencyCode || body.currency_code, "currency_code").toUpperCase();
    const accountIds = normalizeFxAccountIds(body.accountIds || body.account_ids);
    const gainAccountId = required(body.unrealizedGainAccountId || body.unrealized_gain_account_id, "unrealized_gain_account_id");
    const lossAccountId = required(body.unrealizedLossAccountId || body.unrealized_loss_account_id, "unrealized_loss_account_id");
    if (gainAccountId === lossAccountId) throw new Error("FX Gain and Loss Accounts must be different");

    const plan = await buildFxRevaluationPlan({
      organizationId: access.organizationId,
      entityId,
      revaluationDate,
      currencyCode,
      accountIds,
    });

    const { data: offsetAccounts, error: offsetError } = await supabaseAdmin
      .from("chart_of_accounts")
      .select("id,is_active")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .in("id", [gainAccountId, lossAccountId]);
    if (offsetError) throw offsetError;
    if ((offsetAccounts || []).length !== 2 || (offsetAccounts || []).some(account => account.is_active === false)) {
      throw new Error("FX Unrealised Gain and Loss Accounts must be active accounts in the selected Legal Entity");
    }

    const rateSource = plan.rate.configured_source || plan.rate.resolver_source || "CONFIGURED";
    const now = new Date().toISOString();
    const { data: run, error: insertError } = await supabaseAdmin
      .from("finance_fx_revaluation_runs")
      .insert({
        organization_id: access.organizationId,
        entity_id: entityId,
        period_id: body.periodId || body.period_id || null,
        revaluation_date: revaluationDate,
        currency_code: currencyCode,
        rate_source: rateSource,
        unrealized_gain_account_id: gainAccountId,
        unrealized_loss_account_id: lossAccountId,
        notes: text(body.notes) || null,
        account_ids: accountIds.map(account_id => ({ account_id })),
        created_by: access.user?.id || null,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    return NextResponse.json({ success: true, run, plan }, { status: 201 });
  } catch (error) {
    const message = error?.message || "FX Revaluation draft creation failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
