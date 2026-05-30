export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(
  request
) {
  try {

    const {
      searchParams,
    } = new URL(
      request.url
    );

    const access =
      await requireOrganizationAccess({

        organizationId:
          searchParams.get(
            "organizationId"
          ),

      });

    if (!access.success) {

      return Response.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const tenant_id =
      access.tenantId;
   

    // 🔹 TODAY RANGE
    const now = new Date();
    const start = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const end = new Date(now.setHours(23, 59, 59, 999)).toISOString();

    // 🔹 🚨 CHECK STOCK ALERTS (FIX)
    const { data: alerts } = await supabaseAdmin
      .from("alerts") // must match your control scan source
      .select("alert_type, severity")
      .eq("tenant_id", tenant_id);

    const hasCriticalStock = (alerts || []).some(
      (a) => a.alert_type === "stock" && a.severity === "critical"
    );

    // 🔹 GET ORDERS
    const { data: orders, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, staff_name, total, created_at")
      .eq("tenant_id", tenant_id)
      .gte("created_at", start)
      .lte("created_at", end);

    if (orderError) {
      console.error("ORDER FETCH ERROR:", orderError);
      return NextResponse.json({ success: true, data: [] });
    }

    // 🔹 LOAD STAFF TABLE
    const { data: staffData, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("*")
      .eq("tenant_id", tenant_id);

    if (staffError) {
      console.error("STAFF FETCH ERROR:", staffError);
    }

    // 🔹 STAFF LOOKUP BY EMAIL
    const staffLookup = {};

    for (const staff of staffData || []) {
      const email = String(staff.email || "").toLowerCase();
      if (!email) continue;

      const cleanDepartment = String(
        staff.department ||
          staff.position ||
          staff.role ||
          "foh"
      ).toLowerCase();

      staffLookup[email] = {
        name:
          staff.name ||
          staff.staff_name ||
          staff.email ||
          "Unknown",
        department:
          cleanDepartment === "owner" || cleanDepartment === "staff"
            ? "foh"
            : cleanDepartment,
        email,
      };
    }

    // 🔹 BUILD STAFF MAP FROM ORDERS
    const staffMap = {};

    for (const order of orders || []) {
      const email = String(order.staff_name || "unknown").toLowerCase();

      const staffInfo = staffLookup[email] || {
        name: email || "Unknown",
        department: "foh",
        email,
      };

      if (!staffMap[email]) {
        staffMap[email] = {
          name: staffInfo.name,
          department: staffInfo.department || "foh",
          email,
          revenue: 0,
          orders: 0,
        };
      }

      staffMap[email].revenue += Number(order.total || 0);
      staffMap[email].orders += 1;
    }

    // 🔹 ALSO SHOW ACTIVE STAFF EVEN IF NO ORDERS TODAY
    for (const staff of staffData || []) {
      const email = String(staff.email || "").toLowerCase();
      if (!email || staffMap[email]) continue;

      const cleanDepartment = String(
        staff.department ||
          staff.position ||
          staff.role ||
          "foh"
      ).toLowerCase();

      staffMap[email] = {
        name: staff.name || staff.staff_name || staff.email || "Unknown",
        department:
          cleanDepartment === "owner" || cleanDepartment === "staff"
            ? "foh"
            : cleanDepartment,
        email,
        revenue: 0,
        orders: 0,
      };
    }

    // 🔹 CALCULATE SCORES
    const result = Object.values(staffMap).map((staff) => {
      const avgOrder =
        staff.orders > 0 ? staff.revenue / staff.orders : 0;

      let score = 0;

      // FOH scoring model
      score += Math.min(staff.revenue / 1000, 50);
      score += Math.min(staff.orders * 5, 30);
      score += Math.min(avgOrder / 100, 20);

      score = Math.round(score);

      // 🔴 FORCE FAILURE IF STOCK IS CRITICAL (FIX)
      if (hasCriticalStock) {
        score = 0;
      }

      return {
        name: staff.name,
        staff_name: staff.name,
        email: staff.email,
        department: staff.department || "foh",
        score,
        revenue: staff.revenue,
        orders: staff.orders,
        avgOrder: Math.round(avgOrder),
        late: false,
        absent: false,
        system_blocked: hasCriticalStock, // optional flag for UI
      };
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("PERFORMANCE ERROR:", err);

    return NextResponse.json({
      success: true,
      data: [],
    });
  }
}