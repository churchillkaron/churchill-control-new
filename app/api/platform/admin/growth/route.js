import { NextResponse } from "next/server";

import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const PAGE_SIZE = 1000;
const MAX_SUCCESS_USAGE_PAGES = 25;

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addDays(timestamp, days) {
  return new Date(timestamp.getTime() + days * 24 * 60 * 60 * 1000);
}

function inWindow(value, start, end) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp)
    && timestamp >= start.getTime()
    && timestamp < end.getTime();
}

function executionStateFilter(state) {
  return `execution_status.eq.${state},and(execution_status.is.null,status.eq.${state})`;
}

async function countUsage({ organizationId, start, end, state = null }) {
  let query = supabaseAdmin
    .from("platform_service_usage")
    .select("id", { count: "exact", head: true })
    .neq("organization_id", organizationId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (state) query = query.or(executionStateFilter(state));

  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
}

async function readPaged(makeQuery, { maxPages = 10 } = {}) {
  const rows = [];

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await makeQuery().range(from, to);
    if (error) throw error;

    const pageRows = Array.isArray(data) ? data : [];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) {
      return { rows, complete: true };
    }
  }

  return { rows, complete: false };
}

function currencyTotals(rows, valueSelector) {
  const totals = new Map();

  for (const row of rows) {
    const currency = text(row?.currency).toUpperCase() || "UNKNOWN";
    totals.set(currency, number(totals.get(currency)) + number(valueSelector(row)));
  }

  return Object.fromEntries(
    [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, value]) => [currency, Number(value.toFixed(6))]),
  );
}

function subtractCurrencyTotals(left = {}, right = {}) {
  const currencies = new Set([...Object.keys(left), ...Object.keys(right)]);
  return Object.fromEntries(
    [...currencies]
      .sort()
      .map((currency) => [
        currency,
        Number((number(left[currency]) - number(right[currency])).toFixed(6)),
      ]),
  );
}

function customerUsageRows({ organizations, successRows, current7Start, previous7Start, current30Start, observedAt }) {
  const organizationNames = new Map(
    organizations.map((organization) => [organization.id, organization.name || "Organization"]),
  );
  const rows = new Map();

  for (const usage of successRows) {
    const organizationId = usage?.organization_id;
    if (!organizationId || !organizationNames.has(organizationId)) continue;

    const current = rows.get(organizationId) || {
      organizationId,
      organizationName: organizationNames.get(organizationId),
      successful7d: 0,
      successfulPrevious7d: 0,
      successful30d: 0,
      value30dByCurrency: {},
      latestSuccessAt: null,
    };

    if (inWindow(usage.created_at, current7Start, observedAt)) current.successful7d += 1;
    if (inWindow(usage.created_at, previous7Start, current7Start)) current.successfulPrevious7d += 1;

    if (inWindow(usage.created_at, current30Start, observedAt)) {
      current.successful30d += 1;
      const currency = text(usage.currency).toUpperCase() || "UNKNOWN";
      current.value30dByCurrency[currency] = Number(
        (number(current.value30dByCurrency[currency]) + number(usage.customer_price)).toFixed(6),
      );
    }

    if (!current.latestSuccessAt || new Date(usage.created_at) > new Date(current.latestSuccessAt)) {
      current.latestSuccessAt = usage.created_at;
    }

    rows.set(organizationId, current);
  }

  return [...rows.values()]
    .filter((row) => row.successful30d > 0)
    .sort((left, right) => {
      if (right.successful7d !== left.successful7d) return right.successful7d - left.successful7d;
      return right.successful30d - left.successful30d;
    });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organization_id") || url.searchParams.get("organizationId"),
    );

    const access = await requirePlatformOperatorWorkspaceAccess({ organizationId });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    if (access.organizationId !== PLATFORM_ORGANIZATION_ID) {
      return NextResponse.json(
        { success: false, error: "Avantiqo Platform owner workspace required" },
        { status: 404 },
      );
    }

    const observedAt = new Date();
    const current7Start = addDays(observedAt, -7);
    const previous7Start = addDays(observedAt, -14);
    const current30Start = addDays(observedAt, -30);
    const previous30Start = addDays(observedAt, -60);

    const [
      organizationResult,
      invoiceResult,
      serviceResult,
      attempts7d,
      successful7d,
      failed7d,
      attemptsPrevious7d,
      successfulPrevious7d,
      failedPrevious7d,
    ] = await Promise.all([
      supabaseAdmin
        .from("organizations")
        .select("id,name,organization_type,status,organization_status,created_at")
        .neq("id", PLATFORM_ORGANIZATION_ID)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("billing_invoices")
        .select("id,organization_id,bill_to_organization_id,amount,status,currency,created_at")
        .gte("created_at", previous30Start.toISOString())
        .lt("created_at", observedAt.toISOString())
        .order("created_at", { ascending: true }),
      readPaged(
        () => supabaseAdmin
          .from("organization_services")
          .select("id,organization_id,status,activated_at,created_at")
          .neq("organization_id", PLATFORM_ORGANIZATION_ID)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true }),
        { maxPages: 10 },
      ),
      countUsage({ organizationId: PLATFORM_ORGANIZATION_ID, start: current7Start, end: observedAt }),
      countUsage({ organizationId: PLATFORM_ORGANIZATION_ID, start: current7Start, end: observedAt, state: "success" }),
      countUsage({ organizationId: PLATFORM_ORGANIZATION_ID, start: current7Start, end: observedAt, state: "failed" }),
      countUsage({ organizationId: PLATFORM_ORGANIZATION_ID, start: previous7Start, end: current7Start }),
      countUsage({ organizationId: PLATFORM_ORGANIZATION_ID, start: previous7Start, end: current7Start, state: "success" }),
      countUsage({ organizationId: PLATFORM_ORGANIZATION_ID, start: previous7Start, end: current7Start, state: "failed" }),
    ]);

    if (organizationResult.error) throw organizationResult.error;
    if (invoiceResult.error) throw invoiceResult.error;

    const organizations = Array.isArray(organizationResult.data) ? organizationResult.data : [];
    const invoices = (Array.isArray(invoiceResult.data) ? invoiceResult.data : [])
      .filter((invoice) => {
        const billedOrganizationId = invoice.bill_to_organization_id || invoice.organization_id;
        return billedOrganizationId && billedOrganizationId !== PLATFORM_ORGANIZATION_ID;
      })
      .filter((invoice) => ["paid", "issued", "sent"].includes(text(invoice.status).toLowerCase()));
    const services = serviceResult.rows;

    const successUsageResult = await readPaged(
      () => supabaseAdmin
        .from("platform_service_usage")
        .select("id,organization_id,customer_price,supplier_cost,currency,created_at")
        .neq("organization_id", PLATFORM_ORGANIZATION_ID)
        .gte("created_at", previous30Start.toISOString())
        .lt("created_at", observedAt.toISOString())
        .or(executionStateFilter("success"))
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      { maxPages: MAX_SUCCESS_USAGE_PAGES },
    );

    const successRows = successUsageResult.rows;
    const current30SuccessRows = successRows.filter((row) => inWindow(row.created_at, current30Start, observedAt));
    const previous30SuccessRows = successRows.filter((row) => inWindow(row.created_at, previous30Start, current30Start));

    const currentInvoiceRows = invoices.filter((row) => inWindow(row.created_at, current30Start, observedAt));
    const previousInvoiceRows = invoices.filter((row) => inWindow(row.created_at, previous30Start, current30Start));

    const newCustomers30d = organizations.filter((row) => inWindow(row.created_at, current30Start, observedAt));
    const newCustomersPrevious30d = organizations.filter((row) => inWindow(row.created_at, previous30Start, current30Start));

    const activeCustomerOrganizations = organizations.filter((organization) => {
      const status = text(organization.organization_status || organization.status).toLowerCase();
      return !["inactive", "disabled", "archived", "deleted", "suspended"].includes(status);
    });

    const successfulCustomerIds30d = new Set(current30SuccessRows.map((row) => row.organization_id).filter(Boolean));
    const successfulCustomerIdsPrevious30d = new Set(previous30SuccessRows.map((row) => row.organization_id).filter(Boolean));

    const activationMoment = (service) => service.activated_at || service.created_at;
    const activations30d = services.filter((row) => inWindow(activationMoment(row), current30Start, observedAt));
    const activationsPrevious30d = services.filter((row) => inWindow(activationMoment(row), previous30Start, current30Start));

    const usageValue30d = currencyTotals(current30SuccessRows, (row) => row.customer_price);
    const usageValuePrevious30d = currencyTotals(previous30SuccessRows, (row) => row.customer_price);
    const usageCost30d = currencyTotals(current30SuccessRows, (row) => row.supplier_cost);
    const usageCostPrevious30d = currencyTotals(previous30SuccessRows, (row) => row.supplier_cost);
    const usageContribution30d = subtractCurrencyTotals(usageValue30d, usageCost30d);
    const usageContributionPrevious30d = subtractCurrencyTotals(usageValuePrevious30d, usageCostPrevious30d);

    const currentInvoiceValue = currencyTotals(currentInvoiceRows, (row) => row.amount);
    const previousInvoiceValue = currencyTotals(previousInvoiceRows, (row) => row.amount);

    const customerMomentum = customerUsageRows({
      organizations,
      successRows,
      current7Start,
      previous7Start,
      current30Start,
      observedAt,
    });

    const other7d = Math.max(0, attempts7d - successful7d - failed7d);
    const otherPrevious7d = Math.max(0, attemptsPrevious7d - successfulPrevious7d - failedPrevious7d);

    return NextResponse.json({
      success: true,
      operatorOrganizationId: access.organizationId,
      observedAt: observedAt.toISOString(),
      source: "AVANTIQO_PLATFORM_OWNER_GROWTH_EVIDENCE",
      windows: {
        current7Start: current7Start.toISOString(),
        previous7Start: previous7Start.toISOString(),
        current30Start: current30Start.toISOString(),
        previous30Start: previous30Start.toISOString(),
      },
      evidence: {
        successUsageRowsComplete: successUsageResult.complete,
        organizationServiceRowsComplete: serviceResult.complete,
        noCurrencyConversionPerformed: true,
        recurringRevenueMetricClaimed: false,
      },
      customers: {
        total: organizations.length,
        activeRegistered: activeCustomerOrganizations.length,
        new30d: newCustomers30d.length,
        newPrevious30d: newCustomersPrevious30d.length,
        successfulUsage30d: successfulCustomerIds30d.size,
        successfulUsagePrevious30d: successfulCustomerIdsPrevious30d.size,
        latestNewCustomers: [...newCustomers30d]
          .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
          .slice(0, 5)
          .map((row) => ({ id: row.id, name: row.name || "Organization", createdAt: row.created_at })),
      },
      execution: {
        current7d: {
          attempts: attempts7d,
          successful: successful7d,
          failed: failed7d,
          other: other7d,
        },
        previous7d: {
          attempts: attemptsPrevious7d,
          successful: successfulPrevious7d,
          failed: failedPrevious7d,
          other: otherPrevious7d,
        },
      },
      adoption: {
        serviceActivations30d: activations30d.length,
        serviceActivationsPrevious30d: activationsPrevious30d.length,
      },
      economics: {
        successfulUsage: {
          current30d: {
            successfulEvents: current30SuccessRows.length,
            customerValueByCurrency: usageValue30d,
            supplierCostByCurrency: usageCost30d,
            contributionByCurrency: usageContribution30d,
          },
          previous30d: {
            successfulEvents: previous30SuccessRows.length,
            customerValueByCurrency: usageValuePrevious30d,
            supplierCostByCurrency: usageCostPrevious30d,
            contributionByCurrency: usageContributionPrevious30d,
          },
        },
        invoices: {
          current30d: {
            count: currentInvoiceRows.length,
            valueByCurrency: currentInvoiceValue,
          },
          previous30d: {
            count: previousInvoiceRows.length,
            valueByCurrency: previousInvoiceValue,
          },
        },
      },
      customerMomentum: customerMomentum.slice(0, 8),
    });
  } catch (error) {
    console.error("PLATFORM_GROWTH_GET_ERROR", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to read platform growth evidence",
      },
      { status: 500 },
    );
  }
}
