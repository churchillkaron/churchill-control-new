import { NextResponse } from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import { getTenantId }
from "@/lib/shared/tenant/getTenantId";

export async function GET(
  request
) {

  try {

    const tenant_id =
      getTenantId(request);

    // 🔹 TODAY RANGE
    const now = new Date();
    const start = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const end = new Date(now.setHours(23, 59, 59, 999)).toISOString();

    // 🔹 ALERTS
    const { data: alertRows } = await supabaseAdmin
      .from("alerts")
      .select("*")
      .eq("tenant_id", tenant_id);

    const alerts = (alertRows || []).map((a) => ({
      type: a.severity || "info",
      message: `${a.alert_type || "System"} issue`,
    }));

    const hasCritical = (alertRows || []).some(
      (a) => String(a.severity).toLowerCase() === "critical"
    );

    // 🔹 ORDERS
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, staff_name, total, created_at")
      .eq("tenant_id", tenant_id)
      .gte("created_at", start)
      .lte("created_at", end);

    // 🔹 STAFF
    const { data: staffData } = await supabaseAdmin
      .from("staff_accounts")
      .select("*")
      .eq("tenant_id", tenant_id);

    const staffLookup = {};
    for (const s of staffData || []) {
      const email = String(s.email || "").toLowerCase();
      if (!email) continue;

      staffLookup[email] = {
        name: s.name || s.email,
        department: s.department || s.role || "foh",
        email,
      };
    }

    const staffMap = {};

    for (const order of orders || []) {
      const email = String(order.staff_name || "unknown").toLowerCase();

      const info = staffLookup[email] || {
        name: email,
        department: "foh",
        email,
      };

      if (!staffMap[email]) {
        staffMap[email] = {
          ...info,
          revenue: 0,
          orders: 0,
        };
      }

      staffMap[email].revenue += Number(order.total || 0);
      staffMap[email].orders += 1;
    }

    for (const s of staffData || []) {
      const email = String(s.email || "").toLowerCase();
      if (!email || staffMap[email]) continue;

      staffMap[email] = {
        name: s.name || s.email,
        department: s.department || "foh",
        email,
        revenue: 0,
        orders: 0,
      };
    }

    const staff = Object.values(staffMap).map((s) => {
      const avgOrder =
        s.orders > 0 ? s.revenue / s.orders : 0;

      let score = 0;

      score += Math.min(s.revenue / 1000, 50);
      score += Math.min(s.orders * 5, 30);
      score += Math.min(avgOrder / 100, 20);

      score = Math.round(score);

      if (hasCritical) score = 0;

      return {
        name: s.name,
        email: s.email,
        department: s.department,
        score,
        revenue: s.revenue,
        orders: s.orders,
        avgOrder: Math.round(avgOrder),
      };
    });

    const fohScore =
      staff.length > 0
        ? Math.round(
            staff.reduce((sum, s) => sum + s.score, 0) /
              staff.length
          )
        : 0;

    const kitchenLevel = hasCritical ? "CRITICAL" : "GOOD";
    const barLevel = hasCritical ? "CRITICAL" : "GOOD";

    // 🔥 TASK ENGINE (FULL + FIXED)
    const tasks = [];

    // INVOICE
    const { data: pendingInvoices } = await supabaseAdmin
      .from("assets")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("type", "invoice")
      .eq("invoice_status", "pending_manager");

    if ((pendingInvoices || []).length > 0) {
      tasks.push({
        title: `${pendingInvoices.length} invoice(s) need approval`,
        type: "invoice",
      });
    }

    // ROUTINE / PHOTOS
    const { data: routineUploads } = await supabaseAdmin
      .from("assets")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("type", "routine")
      .eq("status", "pending");

    if ((routineUploads || []).length > 0) {
      tasks.push({
        title: `${routineUploads.length} routine upload(s) need review`,
        type: "routine",
      });
    }

    // SALARY
    const { data: salaryConfirm } = await supabaseAdmin
      .from("salary_confirmations")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("status", "pending_manager");

    if ((salaryConfirm || []).length > 0) {
      tasks.push({
        title: `${salaryConfirm.length} salary confirmation(s) need approval`,
        type: "salary",
      });
    }

    // PERFORMANCE
    if (staff.some((s) => s.score < 70)) {
      tasks.push({
        title: "Low staff performance detected",
        type: "performance",
      });
    }

    // CRITICAL
    if (hasCritical) {
      tasks.push({
        title: "Critical system issue — immediate action required",
        type: "critical",
      });
    }

    return NextResponse.json({
      fohScore,
      kitchenLevel,
      barLevel,
      alerts,
      tasks,
      staff,
    });

  } catch (err) {
    console.error("PERFORMANCE ERROR:", err);

    return NextResponse.json({
      fohScore: 0,
      kitchenLevel: "UNKNOWN",
      barLevel: "UNKNOWN",
      alerts: [],
      tasks: [],
      staff: [],
    });
  }
}