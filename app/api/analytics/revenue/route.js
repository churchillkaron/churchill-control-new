import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function amount(order) {
  return Number(order?.total_amount ?? order?.total ?? 0);
}

function status(order) {
  return String(order?.status || "").trim().toUpperCase();
}

function eventTime(order) {
  return order?.paid_at || order?.created_at || null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false })
      .limit(10000);

    if (error) throw error;

    const rows = orders || [];
    const paid = rows.filter((order) => status(order) === "PAID");
    const active = rows.filter((order) => ["ACTIVE", "OPEN"].includes(status(order)));
    const totalRevenue = paid.reduce((sum, order) => sum + amount(order), 0);
    const activeRevenue = active.reduce((sum, order) => sum + amount(order), 0);
    const averageOrderValue = paid.length ? totalRevenue / paid.length : 0;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: 0 }));

    for (const order of paid) {
      const timestamp = eventTime(order);
      if (!timestamp) continue;
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime()) || date < start) continue;
      hourly[date.getHours()].revenue += amount(order);
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      total_revenue: totalRevenue,
      total_orders: paid.length,
      active_revenue: activeRevenue,
      active_orders: active.length,
      average_order_value: averageOrderValue,
      hourly,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Analytics load failed" },
      { status: 500 },
    );
  }
}
