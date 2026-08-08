export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function startAndEndOfTodayUtc() {
  const now = new Date();

  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );

  const end = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );

  return {
    start: start.toISOString(),
    end: end.toISOString(),
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId = searchParams.get("organizationId");

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return Response.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const organizationId = access.organizationId;
    const { start, end } = startAndEndOfTodayUtc();

    const [
      alertsResult,
      ordersResult,
      staffResult,
      performanceResult,
      invoiceResult,
      reviewAssetResult,
      payrollResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("alerts")
        .select("id, alert_type, severity, message, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(100),

      supabaseAdmin
        .from("orders")
        .select(
          "id, staff_id, staff_name, total, total_amount, final_amount, created_at"
        )
        .eq("organization_id", organizationId)
        .gte("created_at", start)
        .lte("created_at", end),

      supabaseAdmin
        .from("staff_accounts")
        .select("id, email, name, role, department, active")
        .eq("active_organization_id", organizationId)
        .eq("active", true),

      supabaseAdmin
        .from("performance")
        .select("id, name, department, score, late, absent, created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", start)
        .lte("created_at", end),

      supabaseAdmin
        .from("assets")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("type", "invoice")
        .eq("invoice_status", "pending_manager"),

      supabaseAdmin
        .from("assets")
        .select("id")
        .eq("organization_id", organizationId)
        .in("type", ["routine", "photo"])
        .eq("status", "pending"),

      supabaseAdmin
        .from("payroll_records")
        .select("id")
        .eq("organization_id", organizationId)
        .in("status", ["GENERATED", "RECALCULATED"]),
    ]);

    const queryResults = [
      ["alerts", alertsResult],
      ["orders", ordersResult],
      ["staff_accounts", staffResult],
      ["performance", performanceResult],
      ["invoice assets", invoiceResult],
      ["review assets", reviewAssetResult],
      ["payroll_records", payrollResult],
    ];

    for (const [source, result] of queryResults) {
      if (result.error) {
        throw new Error(
          `Unable to load ${source}: ${result.error.message}`
        );
      }
    }

    const alertRows = alertsResult.data || [];
    const orders = ordersResult.data || [];
    const staffRows = staffResult.data || [];
    const performanceRows = performanceResult.data || [];

    const alerts = alertRows.map((alert) => ({
      type: alert.severity || "info",
      message:
        alert.message ||
        `${alert.alert_type || "System"} issue`,
    }));

    const hasCritical = alertRows.some(
      (alert) => normalizeText(alert.severity) === "critical"
    );

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
        revenue: sales.revenue,
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
        revenue: legacy.revenue,
        orders: legacy.orders,
        avgOrder: Math.round(avgOrder),
      });
    }

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

    if (hasCritical) {
      tasks.push({
        title: "Critical system issue — immediate action required",
        type: "critical",
      });
    }

    return NextResponse.json({
      success: true,
      organizationId,
      period: {
        start,
        end,
        basis: "UTC",
      },
      fohScore,
      kitchenLevel: performanceLevel(kitchenScore),
      barLevel: performanceLevel(barScore),
      departmentScores: {
        foh: fohScore,
        kitchen: kitchenScore,
        bar: barScore,
      },
      alerts,
      tasks,
      staff,
      evidence: {
        orders: orders.length,
        performanceRecords: performanceRows.length,
        scoredStaff: staff.filter((member) =>
          Number.isFinite(member.score)
        ).length,
      },
    });
  } catch (error) {
    console.error("PERFORMANCE_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message || "Unable to load performance overview",
        fohScore: null,
        kitchenLevel: "UNKNOWN",
        barLevel: "UNKNOWN",
        alerts: [],
        tasks: [],
        staff: [],
      },
      { status: 500 }
    );
  }
}
