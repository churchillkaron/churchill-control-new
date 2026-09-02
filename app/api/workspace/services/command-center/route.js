export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function scoped(query, entityId) {
  return entityId
    ? query.or(`entity_id.eq.${entityId},entity_id.is.null`)
    : query;
}

async function source(name, task, fallback = []) {
  const startedAt = Date.now();
  try {
    const data = await task();
    return { name, status: "connected", data: data ?? fallback, error: null, durationMs: Date.now() - startedAt };
  } catch (error) {
    console.error("SERVICES_SOURCE_FAILED", { source: name, error });
    return { name, status: "error", data: fallback, error: error?.message || "Source unavailable", durationMs: Date.now() - startedAt };
  }
}

function currencyTotals(rows, amountFields) {
  const totals = new Map();
  for (const row of rows || []) {
    const currency = clean(row.currency || row.default_currency || "UNSPECIFIED").toUpperCase();
    const current = totals.get(currency) || Object.fromEntries(amountFields.map((field) => [field, 0]));
    for (const field of amountFields) current[field] += number(row[field]);
    totals.set(currency, current);
  }
  return [...totals.entries()].map(([currency, values]) => ({ currency, ...values }));
}

function isActive(value) {
  return ["active", "enabled", "ready", "healthy", "connected"].includes(normalized(value));
}

function isFailure(value) {
  return ["failed", "error", "unhealthy", "disconnected", "suspended", "disabled"].includes(normalized(value));
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const entityId = clean(url.searchParams.get("entityId") || url.searchParams.get("entity_id"));
    const periodId = clean(url.searchParams.get("periodId") || url.searchParams.get("period_id"));

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error }, { status: context.status || 400 });
    }

    const resolvedEntityId = context.entityId || null;
    const now = new Date();
    const trailing30 = new Date(now.getTime() - 30 * 86400000).toISOString();
    const today = now.toISOString().slice(0, 10);

    const [walletsSource, servicesSource, usageSource, billingQueueSource, reconciliationSource, integrationsSource, enterpriseIntegrationsSource] = await Promise.all([
      source("organization_wallets", async () => {
        let query = supabaseAdmin
          .from("organization_wallets")
          .select("id,entity_id,currency,default_currency,available_balance,reserved_balance,status,minimum_balance,low_balance_warning,allow_negative,last_topup_at,last_charge_at,lifetime_topups,lifetime_usage,lifetime_refunds,updated_at")
          .eq("organization_id", context.organizationId);
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.limit(250);
        if (error) throw error;
        return data || [];
      }),
      source("organization_services", async () => {
        let query = supabaseAdmin
          .from("organization_services")
          .select("id,entity_id,service_id,status,managed_by,authorization_required,usage_enabled,billing_enabled,health,default_provider_id,fallback_enabled,billing_mode,pricing_mode,budget_limit,budget_used,hard_budget_limit,default_currency,last_execution_at,total_requests,total_failures,total_cost,updated_at")
          .eq("organization_id", context.organizationId);
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.limit(2000);
        if (error) throw error;
        return data || [];
      }),
      source("platform_service_usage", async () => {
        let query = supabaseAdmin
          .from("platform_service_usage")
          .select("id,entity_id,category,provider,capability,operation,quantity,unit,supplier_cost,platform_markup,customer_price,currency,status,latency_ms,invoice_status,error_message,created_at,execution_status,reserved_amount,charged_amount,refunded_amount,billing_completed,finance_posted,retry_count")
          .eq("organization_id", context.organizationId)
          .gte("created_at", trailing30)
          .order("created_at", { ascending: false });
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.limit(10000);
        if (error) throw error;
        return data || [];
      }),
      source("service_billing_queue", async () => {
        let query = supabaseAdmin
          .from("service_billing_queue")
          .select("id,entity_id,usage_id,status,attempts,available_at,locked_at,completed_at,billing_invoice_id,last_error,created_at,updated_at")
          .eq("organization_id", context.organizationId)
          .neq("status", "completed")
          .order("created_at", { ascending: false });
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.limit(1000);
        if (error) throw error;
        return data || [];
      }),
      source("service_revenue_reconciliation", async () => {
        let query = supabaseAdmin
          .from("service_revenue_reconciliation")
          .select("id,entity_id,usage_id,provider,currency,expected_customer_charge,wallet_charged,invoiced_amount,supplier_cost,platform_markup,billing_completed,finance_posted,status,issue_code,first_seen_at,last_checked_at,resolved_at")
          .eq("organization_id", context.organizationId)
          .neq("status", "resolved")
          .order("first_seen_at", { ascending: false });
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.limit(1000);
        if (error) throw error;
        return data || [];
      }),
      source("integration_connections", async () => {
        const { data, error } = await supabaseAdmin
          .from("integration_connections")
          .select("id,category,provider,display_name,enabled,status,billing_mode,routing_policy,health_status,updated_at")
          .eq("organization_id", context.organizationId)
          .order("updated_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        return data || [];
      }),
      source("enterprise_integrations", async () => {
        const { data, error } = await supabaseAdmin
          .from("enterprise_integrations")
          .select("id,integration_name,integration_type,provider,connection_status,last_sync_at,next_sync_at,sync_frequency,active,updated_at")
          .eq("organization_id", context.organizationId)
          .order("updated_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        return data || [];
      }),
    ]);

    const wallets = walletsSource.data || [];
    const services = servicesSource.data || [];
    const usage = usageSource.data || [];
    const billingQueue = billingQueueSource.data || [];
    const reconciliation = reconciliationSource.data || [];
    const integrations = integrationsSource.data || [];
    const enterpriseIntegrations = enterpriseIntegrationsSource.data || [];

    const walletByCurrency = currencyTotals(wallets, ["available_balance", "reserved_balance", "lifetime_topups", "lifetime_usage", "lifetime_refunds"]);
    const usageByCurrency = currencyTotals(usage, ["supplier_cost", "platform_markup", "customer_price", "charged_amount", "refunded_amount"]);

    const lowBalanceWallets = wallets.filter((row) => {
      const threshold = row.low_balance_warning ?? row.minimum_balance;
      return threshold !== null && threshold !== undefined && number(row.available_balance) <= number(threshold);
    });
    const unhealthyServices = services.filter((row) => isFailure(row.health) || isFailure(row.status));
    const budgetRiskServices = services.filter((row) => {
      const limit = number(row.hard_budget_limit || row.budget_limit);
      return limit > 0 && number(row.budget_used) >= limit * 0.8;
    });
    const failedUsage = usage.filter((row) => isFailure(row.status) || isFailure(row.execution_status) || Boolean(row.error_message));
    const unbilledUsage = usage.filter((row) => row.billing_completed !== true && number(row.customer_price) > 0);
    const unpostedUsage = usage.filter((row) => row.billing_completed === true && row.finance_posted !== true && number(row.customer_price) > 0);
    const unhealthyIntegrations = integrations.filter((row) => row.enabled !== false && (isFailure(row.status) || isFailure(row.health_status)));
    const unhealthyEnterpriseIntegrations = enterpriseIntegrations.filter((row) => row.active !== false && !isActive(row.connection_status));

    const todayUsage = usage.filter((row) => String(row.created_at || "").slice(0, 10) === today);
    const topProviders = new Map();
    for (const row of usage) {
      const key = clean(row.provider || "Unspecified");
      const current = topProviders.get(key) || { provider: key, requests: 0, failures: 0, supplierCost: 0, customerPrice: 0 };
      current.requests += 1;
      current.failures += isFailure(row.status) || isFailure(row.execution_status) || Boolean(row.error_message) ? 1 : 0;
      current.supplierCost += number(row.supplier_cost);
      current.customerPrice += number(row.customer_price);
      topProviders.set(key, current);
    }

    const queue = [];
    lowBalanceWallets.forEach((row) => queue.push({ id: `wallet:${row.id}`, priority: "critical", kind: "wallet", title: `Wallet balance requires attention`, detail: `${clean(row.currency || row.default_currency || "Currency")} ${number(row.available_balance).toLocaleString()} available`, status: "Low balance", href: "/services/wallet" }));
    unhealthyServices.slice(0, 8).forEach((row) => queue.push({ id: `service:${row.id}`, priority: "attention", kind: "service", title: clean(row.service_id || "Service"), detail: `Status ${clean(row.status || "unknown")} · Health ${clean(row.health || "unknown")}`, status: "Service health", href: "/services/connected-services" }));
    budgetRiskServices.slice(0, 8).forEach((row) => queue.push({ id: `budget:${row.id}`, priority: "attention", kind: "budget", title: clean(row.service_id || "Service budget"), detail: `${number(row.budget_used).toLocaleString()} used of ${number(row.hard_budget_limit || row.budget_limit).toLocaleString()} ${clean(row.default_currency)}`, status: "Budget risk", href: "/services/connected-services" }));
    billingQueue.slice(0, 8).forEach((row) => queue.push({ id: `billing:${row.id}`, priority: normalized(row.status) === "failed" ? "critical" : "review", kind: "billing", title: "Service billing queue", detail: row.last_error || `Attempt ${number(row.attempts)} · ${clean(row.status)}`, status: clean(row.status || "pending"), href: "/services/usage" }));
    reconciliation.slice(0, 8).forEach((row) => queue.push({ id: `reconciliation:${row.id}`, priority: "critical", kind: "reconciliation", title: `Revenue reconciliation · ${clean(row.provider || "Provider")}`, detail: clean(row.issue_code || "Billing and finance evidence do not reconcile"), status: clean(row.status || "open"), href: "/services/billing" }));
    [...unhealthyIntegrations, ...unhealthyEnterpriseIntegrations].slice(0, 8).forEach((row) => queue.push({ id: `integration:${row.id}`, priority: "attention", kind: "integration", title: clean(row.display_name || row.integration_name || row.provider || "Integration"), detail: `Connection needs review`, status: clean(row.health_status || row.connection_status || row.status || "review"), href: "/services/integrations" }));

    const sources = [walletsSource, servicesSource, usageSource, billingQueueSource, reconciliationSource, integrationsSource, enterpriseIntegrationsSource].map(({ data, ...entry }) => ({ ...entry, rowCount: Array.isArray(data) ? data.length : 0 }));

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      context: {
        organization_id: context.organizationId,
        entity_id: resolvedEntityId,
        period_id: context.periodId || null,
        currency: context.currency || null,
      },
      metrics: {
        wallets: { total: wallets.length, low_balance: lowBalanceWallets.length, by_currency: walletByCurrency },
        services: { total: services.length, active: services.filter((row) => isActive(row.status)).length, unhealthy: unhealthyServices.length, budget_risk: budgetRiskServices.length },
        usage: { last_30d: usage.length, today: todayUsage.length, failures_30d: failedUsage.length, unbilled: unbilledUsage.length, unposted: unpostedUsage.length, by_currency: usageByCurrency },
        billing: { queue_open: billingQueue.length, reconciliation_open: reconciliation.length },
        integrations: { total: integrations.length + enterpriseIntegrations.length, unhealthy: unhealthyIntegrations.length + unhealthyEnterpriseIntegrations.length },
      },
      queue: queue.slice(0, 30),
      topProviders: [...topProviders.values()].sort((a, b) => b.requests - a.requests).slice(0, 12),
      recentUsage: usage.slice(0, 20),
      services: services.slice(0, 50),
      integrations: [...integrations, ...enterpriseIntegrations].slice(0, 50),
      sources,
    });
  } catch (error) {
    console.error("SERVICES_COMMAND_CENTER_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Services command center failed" }, { status: 500 });
  }
}
