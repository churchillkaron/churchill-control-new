export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const EXCLUDED_PAYMENT_STATUSES = new Set([
  "VOID",
  "CANCELLED",
  "FAILED",
  "REFUNDED",
]);

const CLOSED_ORDER_STATUSES = new Set([
  "PAID",
  "CLOSED",
  "COMPLETED",
  "DONE",
]);

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Number(numeric(value).toFixed(2));
}

function orderRevenue(order = {}) {
  return numeric(
    order.final_amount ??
      order.total_amount ??
      order.total ??
      0
  );
}

function performanceLevel(score) {
  if (!Number.isFinite(score)) return "UNKNOWN";
  if (score < 40) return "CRITICAL";
  if (score < 60) return "BAD";
  if (score < 80) return "WARNING";
  return "GOOD";
}

function average(values = []) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;

  return Math.round(
    valid.reduce((sum, value) => sum + value, 0) /
      valid.length
  );
}

function validTimezone(value) {
  const timezone = String(value || "").trim();
  if (!timezone) return null;

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
    }).format(new Date());
    return timezone;
  } catch {
    return null;
  }
}

function partsInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const values = {};

  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function timezoneOffsetMs(date, timezone) {
  const parts = partsInTimezone(date, timezone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  const dateAtSecondPrecision =
    Math.floor(date.getTime() / 1000) * 1000;

  return representedAsUtc - dateAtSecondPrecision;
}

function localMidnightToUtc({ year, month, day }, timezone) {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const firstOffset = timezoneOffsetMs(guess, timezone);
  let result = new Date(guess.getTime() - firstOffset);
  const secondOffset = timezoneOffsetMs(result, timezone);

  if (secondOffset !== firstOffset) {
    result = new Date(guess.getTime() - secondOffset);
  }

  return result;
}

function businessDayRange(timezone, now = new Date()) {
  const local = partsInTimezone(now, timezone);
  const localDateValue = Date.UTC(
    local.year,
    local.month - 1,
    local.day
  );
  const nextLocalDate = new Date(localDateValue + 24 * 60 * 60 * 1000);

  const start = localMidnightToUtc(
    {
      year: local.year,
      month: local.month,
      day: local.day,
    },
    timezone
  );

  const nextStart = localMidnightToUtc(
    {
      year: nextLocalDate.getUTCFullYear(),
      month: nextLocalDate.getUTCMonth() + 1,
      day: nextLocalDate.getUTCDate(),
    },
    timezone
  );

  const end = new Date(nextStart.getTime() - 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    businessDate: [
      local.year,
      String(local.month).padStart(2, "0"),
      String(local.day).padStart(2, "0"),
    ].join("-"),
  };
}

async function safeQuery(query) {
  try {
    const result = await query;
    return {
      data: result.data || [],
      error: result.error || null,
    };
  } catch (error) {
    return {
      data: [],
      error,
    };
  }
}

async function resolveBusinessSettings(organizationId) {
  const [profileResult, entityResult, locationResult, restaurantResult] =
    await Promise.all([
      safeQuery(
        supabaseAdmin
          .from("finance_organization_profiles")
          .select("entity_id, timezone, base_currency, status, updated_at")
          .eq("organization_id", organizationId)
          .order("updated_at", { ascending: false })
          .limit(100)
      ),
      safeQuery(
        supabaseAdmin
          .from("legal_entities")
          .select(
            "id, timezone, currency, is_active, is_default_accounting_entity"
          )
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .limit(100)
      ),
      safeQuery(
        supabaseAdmin
          .from("business_locations")
          .select("id, timezone, currency_code, status, is_default")
          .eq("organization_id", organizationId)
          .limit(100)
      ),
      safeQuery(
        supabaseAdmin
          .from("restaurant_settings")
          .select("timezone, currency")
          .eq("organization_id", organizationId)
          .limit(10)
      ),
    ]);

  const profiles = profileResult.data || [];
  const entities = entityResult.data || [];
  const locations = locationResult.data || [];
  const restaurantSettings = restaurantResult.data || [];

  const organizationProfile =
    profiles.find(
      (row) => !row.entity_id && validTimezone(row.timezone)
    ) || profiles.find((row) => validTimezone(row.timezone));

  const defaultEntity =
    entities.find(
      (row) =>
        row.is_default_accounting_entity === true &&
        validTimezone(row.timezone)
    ) || entities.find((row) => validTimezone(row.timezone));

  const defaultLocation =
    locations.find(
      (row) => row.is_default === true && validTimezone(row.timezone)
    ) || locations.find((row) => validTimezone(row.timezone));

  const restaurantSetting = restaurantSettings.find((row) =>
    validTimezone(row.timezone)
  );

  const timezone =
    validTimezone(organizationProfile?.timezone) ||
    validTimezone(defaultEntity?.timezone) ||
    validTimezone(defaultLocation?.timezone) ||
    validTimezone(restaurantSetting?.timezone) ||
    "UTC";

  const currency =
    organizationProfile?.base_currency ||
    defaultEntity?.currency ||
    defaultLocation?.currency_code ||
    restaurantSetting?.currency ||
    null;

  return {
    timezone,
    currency,
    sourceHealth: {
      financeProfile: !profileResult.error,
      legalEntities: !entityResult.error,
      businessLocations: !locationResult.error,
      restaurantSettings: !restaurantResult.error,
    },
  };
}

function recordedPerformanceByName(rows = []) {
  const buckets = new Map();

  for (const row of rows) {
    const key = normalizeText(row.name);
    const score = Number(row.score);

    if (!key || !Number.isFinite(score)) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(score);
  }

  return new Map(
    [...buckets.entries()].map(([key, values]) => [
      key,
      average(values),
    ])
  );
}

function recordedDepartmentScores(rows = []) {
  const buckets = new Map();

  for (const row of rows) {
    const department = normalizeText(row.department);
    const score = Number(row.score);

    if (!department || !Number.isFinite(score)) continue;
    if (!buckets.has(department)) buckets.set(department, []);
    buckets.get(department).push(score);
  }

  return new Map(
    [...buckets.entries()].map(([department, values]) => [
      department,
      average(values),
    ])
  );
}

function buildStaffSnapshot({ staffRows, orders, performanceRows }) {
  const staffById = new Map();
  const staffByIdentity = new Map();

  for (const staffAccount of staffRows) {
    staffById.set(staffAccount.id, staffAccount);

    const email = normalizeText(staffAccount.email);
    const name = normalizeText(staffAccount.name);

    if (email) staffByIdentity.set(email, staffAccount);
    if (name) staffByIdentity.set(name, staffAccount);
  }

  const salesByStaffId = new Map();
  const legacySales = new Map();

  for (const order of orders) {
    const revenue = orderRevenue(order);
    const staffAccount =
      (order.staff_id && staffById.get(order.staff_id)) ||
      staffByIdentity.get(normalizeText(order.staff_name)) ||
      null;

    if (staffAccount) {
      const current = salesByStaffId.get(staffAccount.id) || {
        revenue: 0,
        orders: 0,
      };

      current.revenue += revenue;
      current.orders += 1;
      salesByStaffId.set(staffAccount.id, current);
      continue;
    }

    const legacyKey = normalizeText(order.staff_name);
    if (!legacyKey) continue;

    const current = legacySales.get(legacyKey) || {
      name: order.staff_name,
      revenue: 0,
      orders: 0,
    };

    current.revenue += revenue;
    current.orders += 1;
    legacySales.set(legacyKey, current);
  }

  const performanceByName = recordedPerformanceByName(
    performanceRows
  );

  const staff = staffRows.map((staffAccount) => {
    const sales = salesByStaffId.get(staffAccount.id) || {
      revenue: 0,
      orders: 0,
    };

    const avgOrder =
      sales.orders > 0 ? sales.revenue / sales.orders : 0;

    const recordedScore =
      performanceByName.get(normalizeText(staffAccount.name)) ??
      performanceByName.get(normalizeText(staffAccount.email)) ??
      null;

    let salesScore = null;

    if (sales.orders > 0) {
      salesScore = Math.round(
        Math.min(sales.revenue / 1000, 50) +
          Math.min(sales.orders * 5, 30) +
          Math.min(avgOrder / 100, 20)
      );
    }

    return {
      id: staffAccount.id,
      name: staffAccount.name || staffAccount.email,
      email: staffAccount.email,
      department:
        staffAccount.department || staffAccount.role || null,
      score:
        Number.isFinite(recordedScore) ? recordedScore : salesScore,
      scoreSource:
        Number.isFinite(recordedScore)
          ? "performance"
          : Number.isFinite(salesScore)
            ? "sales"
            : "none",
      revenue: roundMoney(sales.revenue),
      orders: sales.orders,
      avgOrder: Math.round(avgOrder),
    };
  });

  for (const legacy of legacySales.values()) {
    const avgOrder =
      legacy.orders > 0 ? legacy.revenue / legacy.orders : 0;

    staff.push({
      id: null,
      name: legacy.name,
      email: null,
      department: null,
      score: Math.round(
        Math.min(legacy.revenue / 1000, 50) +
          Math.min(legacy.orders * 5, 30) +
          Math.min(avgOrder / 100, 20)
      ),
      scoreSource: "sales_legacy_identity",
      revenue: roundMoney(legacy.revenue),
      orders: legacy.orders,
      avgOrder: Math.round(avgOrder),
    });
  }

  return staff;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId = searchParams.get("organizationId");

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId: requestedOrganizationId,
    });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
          availableOrganizationIds:
            context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      );
    }

    const organizationId = context.organizationId;
    const settings = await resolveBusinessSettings(organizationId);
    const period = businessDayRange(settings.timezone);

    const [
      paymentsResult,
      ordersResult,
      alertsResult,
      staffResult,
      performanceResult,
      invoiceResult,
      reviewAssetResult,
      payrollResult,
      inventoryAlertsResult,
    ] = await Promise.all([
      safeQuery(
        supabaseAdmin
          .from("payments")
          .select(
            "id, amount, currency, status, order_id, session_id, created_at, paid_at"
          )
          .eq("organization_id", organizationId)
          .gte("created_at", period.start)
          .lte("created_at", period.end)
      ),
      safeQuery(
        supabaseAdmin
          .from("orders")
          .select(
            "id, staff_id, staff_name, total, total_amount, final_amount, cost, service_charge_amount, status, payment_status, paid_at, created_at"
          )
          .eq("organization_id", organizationId)
          .gte("created_at", period.start)
          .lte("created_at", period.end)
      ),
      safeQuery(
        supabaseAdmin
          .from("alerts")
          .select("id, alert_type, severity, message, created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(100)
      ),
      safeQuery(
        supabaseAdmin
          .from("staff_accounts")
          .select("id, email, name, role, department, active")
          .eq("active_organization_id", organizationId)
          .eq("active", true)
      ),
      safeQuery(
        supabaseAdmin
          .from("performance")
          .select("id, name, department, score, late, absent, created_at")
          .eq("organization_id", organizationId)
          .gte("created_at", period.start)
          .lte("created_at", period.end)
      ),
      safeQuery(
        supabaseAdmin
          .from("assets")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("type", "invoice")
          .eq("invoice_status", "pending_manager")
      ),
      safeQuery(
        supabaseAdmin
          .from("assets")
          .select("id")
          .eq("organization_id", organizationId)
          .in("type", ["routine", "photo"])
          .eq("status", "pending")
      ),
      safeQuery(
        supabaseAdmin
          .from("payroll_records")
          .select("id")
          .eq("organization_id", organizationId)
          .in("status", ["GENERATED", "RECALCULATED"])
      ),
      safeQuery(
        supabaseAdmin
          .from("inventory_alerts")
          .select(
            "id, item_id, alert_type, current_quantity, minimum_quantity, message, created_at"
          )
          .eq("organization_id", organizationId)
          .eq("resolved", false)
          .order("created_at", { ascending: false })
          .limit(100)
      ),
    ]);

    const payments = paymentsResult.data || [];
    const ordersToday = ordersResult.data || [];
    const alertRows = alertsResult.data || [];
    const staffRows = staffResult.data || [];
    const performanceRows = performanceResult.data || [];
    const inventoryAlerts = inventoryAlertsResult.data || [];

    const validPayments = payments.filter(
      (payment) =>
        !EXCLUDED_PAYMENT_STATUSES.has(
          normalizeStatus(payment.status)
        )
    );

    const revenue = roundMoney(
      validPayments.reduce(
        (sum, payment) => sum + numeric(payment.amount),
        0
      )
    );

    const paidOrders = ordersToday.filter((order) => {
      const paymentStatus = normalizeStatus(order.payment_status);
      const orderStatus = normalizeStatus(order.status);

      return (
        paymentStatus === "PAID" ||
        CLOSED_ORDER_STATUSES.has(orderStatus) ||
        Boolean(order.paid_at)
      );
    });

    const serviceCharge = roundMoney(
      paidOrders.reduce(
        (sum, order) =>
          sum + numeric(order.service_charge_amount),
        0
      )
    );

    const cogs = roundMoney(
      paidOrders.reduce(
        (sum, order) => sum + numeric(order.cost),
        0
      )
    );

    const transactionKeys = new Set(
      validPayments.map((payment) =>
        payment.order_id ||
        payment.session_id ||
        payment.id
      )
    );

    const orders =
      paidOrders.length || transactionKeys.size || ordersToday.length;

    const avgOrder =
      orders > 0 ? roundMoney(revenue / orders) : 0;

    const profit = roundMoney(revenue - cogs);
    const costPercent =
      revenue > 0
        ? Number(((cogs / revenue) * 100).toFixed(1))
        : 0;

    const alerts = [
      ...alertRows.map((alert) => ({
        type: alert.severity || "info",
        message:
          alert.message ||
          `${alert.alert_type || "System"} issue`,
      })),
      ...inventoryAlerts.map((alert) => ({
        type:
          numeric(alert.current_quantity) <= 0
            ? "critical"
            : "warning",
        message:
          alert.message ||
          "Inventory level requires attention",
      })),
    ];

    const staff = buildStaffSnapshot({
      staffRows,
      orders: ordersToday,
      performanceRows,
    });

    const departmentScores = recordedDepartmentScores(
      performanceRows
    );

    const fohRecordedScore = average(
      [...departmentScores.entries()]
        .filter(([department]) =>
          ["foh", "front of house", "service", "waiter"].includes(
            department
          )
        )
        .map(([, score]) => score)
    );

    const fohSalesScore = average(
      staff
        .filter((member) => {
          const department = normalizeText(member.department);
          return (
            member.scoreSource === "sales" &&
            [
              "foh",
              "front of house",
              "service",
              "waiter",
              "manager",
            ].includes(department)
          );
        })
        .map((member) => member.score)
    );

    const fohScore =
      Number.isFinite(fohRecordedScore)
        ? fohRecordedScore
        : fohSalesScore;

    const kitchenScore = average(
      [...departmentScores.entries()]
        .filter(([department]) =>
          ["kitchen", "boh", "back of house", "chef"].includes(
            department
          )
        )
        .map(([, score]) => score)
    );

    const barScore = average(
      [...departmentScores.entries()]
        .filter(([department]) =>
          ["bar", "bartender"].includes(department)
        )
        .map(([, score]) => score)
    );

    const tasks = [];

    if ((invoiceResult.data || []).length > 0) {
      tasks.push({
        title: `${invoiceResult.data.length} invoice(s) need approval`,
        type: "invoice",
      });
    }

    if ((reviewAssetResult.data || []).length > 0) {
      tasks.push({
        title: `${reviewAssetResult.data.length} routine/photo upload(s) need review`,
        type: "routine",
      });
    }

    if ((payrollResult.data || []).length > 0) {
      tasks.push({
        title: `${payrollResult.data.length} payroll record(s) need governance review`,
        type: "payroll",
      });
    }

    if (inventoryAlerts.length > 0) {
      tasks.push({
        title: `${inventoryAlerts.length} inventory alert(s) need attention`,
        type: "inventory",
      });
    }

    const lowPerformance = staff.filter(
      (member) =>
        Number.isFinite(member.score) && member.score < 70
    );

    if (lowPerformance.length > 0) {
      tasks.push({
        title: `${lowPerformance.length} staff performance record(s) need attention`,
        type: "performance",
      });
    }

    const stock = inventoryAlerts.map((alert) => ({
      id: alert.id,
      itemId: alert.item_id,
      type: alert.alert_type,
      currentQuantity: numeric(alert.current_quantity),
      minimumQuantity: numeric(alert.minimum_quantity),
      message: alert.message || null,
    }));

    return NextResponse.json({
      success: true,
      deprecated: true,
      replacement: "/api/workspace/command-center",
      organizationId,
      timezone: settings.timezone,
      currency: settings.currency,
      period: {
        businessDate: period.businessDate,
        start: period.start,
        end: period.end,
        basis: settings.timezone,
      },
      revenue,
      orders,
      avgOrder,
      serviceCharge,
      fohScore,
      kitchenLevel: performanceLevel(kitchenScore),
      barLevel: performanceLevel(barScore),
      cogs,
      profit,
      costPercent,
      alerts,
      tasks,
      stock,
      staff,
      evidence: {
        payments: validPayments.length,
        ordersCreated: ordersToday.length,
        paidOrders: paidOrders.length,
        performanceRecords: performanceRows.length,
        scoredStaff: staff.filter((member) =>
          Number.isFinite(member.score)
        ).length,
        inventoryAlerts: inventoryAlerts.length,
      },
      sourceHealth: {
        ...settings.sourceHealth,
        payments: !paymentsResult.error,
        orders: !ordersResult.error,
        alerts: !alertsResult.error,
        staff: !staffResult.error,
        performance: !performanceResult.error,
        invoices: !invoiceResult.error,
        reviewAssets: !reviewAssetResult.error,
        payroll: !payrollResult.error,
        inventoryAlerts: !inventoryAlertsResult.error,
      },
    });
  } catch (error) {
    console.error("DASHBOARD_TODAY_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load dashboard",
        revenue: 0,
        orders: 0,
        avgOrder: 0,
        serviceCharge: 0,
        fohScore: null,
        kitchenLevel: "UNKNOWN",
        barLevel: "UNKNOWN",
        cogs: 0,
        profit: 0,
        costPercent: 0,
        alerts: [],
        tasks: [],
        stock: [],
        staff: [],
      },
      { status: 500 }
    );
  }
}
