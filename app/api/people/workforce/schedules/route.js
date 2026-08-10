export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Manager scheduling is trusted server-side workforce administration.
import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
]);

function roleOf(value) {
  return String(value || "").trim().toUpperCase();
}

function contextError(context) {
  return NextResponse.json(
    {
      success: false,
      error: context.error,
      code: context.code,
      availableOrganizationIds: context.availableOrganizationIds || [],
    },
    { status: context.status || 403 }
  );
}

async function managementContext(request) {
  const context = await resolveAuthenticatedStaffContext({ request });
  if (!context.success) return { response: contextError(context) };

  const role = roleOf(context.role || context.staff?.role);
  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Workforce scheduling permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    organizationId: context.organizationId,
    manager: context.staff,
    role,
  };
}

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) {
    throw new Error("month must use YYYY-MM format");
  }

  const start = `${month}-01`;
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);

  return { start, end: end.toISOString().slice(0, 10) };
}

function cleanTime(value) {
  const text = String(value || "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    throw new Error("startTime and endTime must use HH:MM format");
  }
  return text;
}

export async function GET(request) {
  try {
    const ctx = await managementContext(request);
    if (ctx.response) return ctx.response;

    const month =
      new URL(request.url).searchParams.get("month") ||
      new Date().toISOString().slice(0, 7);
    const range = monthRange(month);

    const [staffResult, scheduleResult] = await Promise.all([
      supabaseAdmin
        .from("staff_accounts")
        .select("id,name,email,role,position,department,party_id,active")
        .eq("active_organization_id", ctx.organizationId)
        .eq("active", true)
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("staff_schedules")
        .select("*")
        .eq("organization_id", ctx.organizationId)
        .gte("shift_date", range.start)
        .lt("shift_date", range.end)
        .order("shift_date", { ascending: true })
        .order("start_time", { ascending: true }),
    ]);

    if (staffResult.error) throw staffResult.error;
    if (scheduleResult.error) throw scheduleResult.error;

    return NextResponse.json({
      success: true,
      organizationId: ctx.organizationId,
      month,
      staff: staffResult.data || [],
      schedules: scheduleResult.data || [],
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load schedules" },
      { status: 400 }
    );
  }
}

export async function POST(request) {
  try {
    const ctx = await managementContext(request);
    if (ctx.response) return ctx.response;

    const body = await request.json();
    const staffId = String(body?.staffId || "").trim();
    const shiftDate = String(body?.shiftDate || "").trim();
    const startTime = cleanTime(body?.startTime);
    const endTime = cleanTime(body?.endTime);

    if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)) {
      return NextResponse.json(
        { success: false, error: "staffId and shiftDate are required" },
        { status: 400 }
      );
    }

    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,name,email,role,position,department,party_id")
      .eq("id", staffId)
      .eq("active_organization_id", ctx.organizationId)
      .eq("active", true)
      .maybeSingle();

    if (staffError) throw staffError;
    if (!staff) {
      return NextResponse.json(
        { success: false, error: "Active staff member not found in organization" },
        { status: 404 }
      );
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("staff_schedules")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("staff_id", staffId)
      .eq("shift_date", shiftDate)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;

    const payload = {
      organization_id: ctx.organizationId,
      party_id: staff.party_id || null,
      staff_id: staff.id,
      staff_name: staff.name || staff.email || "Staff",
      role: staff.role || staff.position || null,
      department: staff.department || null,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      shift_type: String(body?.shiftType || "STANDARD").trim().toUpperCase(),
      notes: String(body?.notes || "").trim() || null,
      status: "PUBLISHED",
      created_by: ctx.manager?.id || null,
    };

    const query = existing?.id
      ? supabaseAdmin
          .from("staff_schedules")
          .update(payload)
          .eq("id", existing.id)
          .eq("organization_id", ctx.organizationId)
      : supabaseAdmin.from("staff_schedules").insert(payload);

    const { data, error } = await query.select("*").single();
    if (error) throw error;

    return NextResponse.json({ success: true, schedule: data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to save schedule" },
      { status: 400 }
    );
  }
}

export async function DELETE(request) {
  try {
    const ctx = await managementContext(request);
    if (ctx.response) return ctx.response;

    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { success: false, error: "schedule id required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("staff_schedules")
      .delete()
      .eq("id", id)
      .eq("organization_id", ctx.organizationId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to delete schedule" },
      { status: 400 }
    );
  }
}
