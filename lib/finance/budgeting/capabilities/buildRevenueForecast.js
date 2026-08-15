import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const FORECAST_DAYS = 30;
const PAGE_SIZE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isRevenueAccount(account = {}) {
  const classification = [
    account.account_category,
    account.account_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return (
    classification.includes("REVENUE") ||
    classification.includes("INCOME")
  );
}

function parseDateUtc(dateValue) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid ledger transaction date");
  }

  return date;
}

function addDays(dateValue, days) {
  const date = parseDateUtc(dateValue);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function inclusiveCalendarDays(startDate, endDate) {
  const start = parseDateUtc(startDate);
  const end = parseDateUtc(endDate);
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

export async function getRevenueAccountIds(organizationId, entityId) {
  let query = supabaseAdmin
    .from("chart_of_accounts")
    .select("id, account_category, account_type")
    .eq("organization_id", organizationId);

  if (entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data || [])
    .filter(isRevenueAccount)
    .map((account) => account.id)
    .filter(Boolean);
}

async function getLatestRevenueDate({
  organizationId,
  entityId,
  accountIds,
}) {
  let query = supabaseAdmin
    .from("general_ledger")
    .select("transaction_date")
    .eq("organization_id", organizationId)
    .in("account_id", accountIds)
    .not("transaction_date", "is", null);

  if (entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data, error } = await query
    .order("transaction_date", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0]?.transaction_date || null;
}

export async function getRevenueEntries({
  organizationId,
  entityId,
  accountIds,
  startDate,
  endDate,
}) {
  const rows = [];
  let offset = 0;

  while (true) {
    let query = supabaseAdmin
      .from("general_ledger")
      .select("id, debit, credit, transaction_date")
      .eq("organization_id", organizationId)
      .in("account_id", accountIds)
      .gte("transaction_date", startDate)
      .lte("transaction_date", endDate);

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    const { data, error } = await query
      .order("transaction_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return rows;
}

function emptyForecast() {
  return {
    success: true,
    average_daily_revenue: 0,
    projected_30_day_revenue: 0,
    generated_at: new Date().toISOString(),
  };
}

export default async function buildRevenueForecast({
  organization_id,
  entity_id = null,
}) {
  try {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    const revenueAccountIds = await getRevenueAccountIds(
      organization_id,
      entity_id
    );

    if (revenueAccountIds.length === 0) {
      return emptyForecast();
    }

    const latestRevenueDate = await getLatestRevenueDate({
      organizationId: organization_id,
      entityId: entity_id,
      accountIds: revenueAccountIds,
    });

    if (!latestRevenueDate) {
      return emptyForecast();
    }

    const lookbackStart = addDays(
      latestRevenueDate,
      -(FORECAST_DAYS - 1)
    );

    const entries = await getRevenueEntries({
      organizationId: organization_id,
      entityId: entity_id,
      accountIds: revenueAccountIds,
      startDate: lookbackStart,
      endDate: latestRevenueDate,
    });

    if (entries.length === 0) {
      return emptyForecast();
    }

    const firstObservedDate = entries[0].transaction_date;
    const observationDays = inclusiveCalendarDays(
      firstObservedDate,
      latestRevenueDate
    );

    const totalRevenue = entries.reduce(
      (sum, row) =>
        sum +
        Number(row.credit || 0) -
        Number(row.debit || 0),
      0
    );

    const averageDailyRevenue =
      observationDays > 0
        ? totalRevenue / observationDays
        : 0;

    return {
      success: true,
      average_daily_revenue: averageDailyRevenue,
      projected_30_day_revenue:
        averageDailyRevenue * FORECAST_DAYS,
      generated_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
