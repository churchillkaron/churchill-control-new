export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

const MAX_STAFF_PER_BATCH = 100;
const MAX_DATES_PER_BATCH = 62;
const MAX_ROWS_PER_BATCH = 1000;

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

async function managementContext(request, requestedOrganizationId = null) {
  const context = await resolveAuthenticatedStaffContext({
    request,
    organizationId: requestedOrganizationId || null,
  });

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

function cleanDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error("shift dates must use YYYY-MM-DD format");
  }

  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error(`Invalid shift date: ${text}`);
  }

  return text;
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function readStaffIds(body) {
  const values = Array.isArray(body?.staffIds)
    ? body.staffIds
    : body?.staffId
      ? [body.staffId]
      : [];

  const staffIds = uniqueStrings(values);
  if (!staffIds.length) throw new Error("At least one staff member is required");
  if (staffIds.length > MAX_STAFF_PER_BATCH) {
    throw new Error(`A scheduling batch can include at most ${MAX_STAFF_PER_BATCH} staff members`);
  }

  return staffIds;
}

function readShiftDates(body) {
  const values = Array.isArray(body?.shiftDates)
    ? body.shiftDates
    : body?.shiftDate
      ? [body.shiftDate]
      : [];

  const shiftDates = uniqueStrings(values).map(cleanDate).sort();
  if (!shiftDates.length) throw new Error("At least one shift date is required");
  if (shiftDates.length > MAX_DATES_PER_BATCH) {
    throw new Error(`A scheduling batch can include at most ${MAX_DATES_PER_BATCH} dates`);
  }

  return shiftDates;
}

function rowKey(staffId, shiftDate) {
  return `${staffId}:${shiftDate}`;
}

async function loadActiveStaff({ organizationId, staffIds }) {
  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,name,email,role,position,department,party_id")
    .eq("active_organization_id", organizationId)
    .eq("active", true)
    .in("id", staffIds);

  if (error) throw error;

  const staff = data || [];
  if (staff.length !== staffIds.length) {
    throw new Error("One or more selected staff members are not active in this organization");
  }

  return staff;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const requestedOrganizationId = url.searchParams.get("organizationId") || null;
    const ctx = await managementContext(request, requestedOrganizationId);
    if (ctx.response) return ctx.response;

    const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
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
        .eq("status", "PUBLISHED")
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
      role: ctx.role,
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
    const body = await request.json();
    const requestedOrganizationId =
      String(body?.organizationId || body?.organization_id || "").trim() || null;
    const ctx = await managementContext(request, requestedOrganizationId);
    if (ctx.response) return ctx.response;

    const staffIds = readStaffIds(body);
    const shiftDates = readShiftDates(body);
    const startTime = cleanTime(body?.startTime);
    const endTime = cleanTime(body?.endTime);
    const shiftType = String(body?.shiftType || "STANDARD").trim().toUpperCase() || "STANDARD";
    const notes = String(body?.notes || "").trim() || null;
    const requestedRows = staffIds.length * shiftDates.length;

    if (requestedRows > MAX_ROWS_PER_BATCH) {
      return NextResponse.json(
        {
          success: false,
          error: `A scheduling batch can publish at most ${MAX_ROWS_PER_BATCH} staff-date rows`,
        },
        { status: 400 }
      );
    }

    const staff = await loadActiveStaff({
      organizationId: ctx.organizationId,
      staffIds,
    });
    const staffById = new Map(staff.map((member) => [member.id, member]));

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("staff_schedules")
      .select("id,staff_id,shift_date")
      .eq("organization_id", ctx.organizationId)
      .in("staff_id", staffIds)
      .in("shift_date", shiftDates);

    if (existingError) throw existingError;

    const existingKeys = new Set(
      (existingRows || []).map((row) => rowKey(row.staff_id, row.shift_date))
    );

    const commonUpdate = {
      start_time: startTime,
      end_time: endTime,
      shift_type: shiftType,
      notes,
      status: "PUBLISHED",
      created_by: ctx.manager?.id || null,
    };

    let updatedCount = 0;
    if ((existingRows || []).length > 0) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("staff_schedules")
        .update(commonUpdate)
        .eq("organization_id", ctx.organizationId)
        .in("staff_id", staffIds)
        .in("shift_date", shiftDates)
        .select("id");

      if (updateError) throw updateError;
      updatedCount = (updated || []).length;
    }

    const inserts = [];
    for (const staffId of staffIds) {
      const member = staffById.get(staffId);
      for (const shiftDate of shiftDates) {
        if (existingKeys.has(rowKey(staffId, shiftDate))) continue;

        inserts.push({
          organization_id: ctx.organizationId,
          party_id: member?.party_id || null,
          staff_id: staffId,
          staff_name: member?.name || member?.email || "Staff",
          role: member?.role || member?.position || null,
          department: member?.department || null,
          shift_date: shiftDate,
          start_time: startTime,
          end_time: endTime,
          shift_type: shiftType,
          notes,
          status: "PUBLISHED",
          created_by: ctx.manager?.id || null,
        });
      }
    }

    let createdCount = 0;
    if (inserts.length > 0) {
      const { data: created, error: createError } = await supabaseAdmin
        .from("staff_schedules")
        .insert(inserts)
        .select("id");

      if (createError) throw createError;
      createdCount = (created || []).length;
    }

    return NextResponse.json({
      success: true,
      organizationId: ctx.organizationId,
      publishedRows: createdCount + updatedCount,
      createdCount,
      updatedCount,
      staffCount: staffIds.length,
      dateCount: shiftDates.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to save schedule" },
      { status: 400 }
    );
  }
}

export async function DELETE(request) {
  try {
    const url = new URL(request.url);
    const requestedOrganizationId = url.searchParams.get("organizationId") || null;
    const ctx = await managementContext(request, requestedOrganizationId);
    if (ctx.response) return ctx.response;

    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { success: false, error: "schedule id required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("staff_schedules")
      .update({
        status: "CANCELLED",
        created_by: ctx.manager?.id || null,
      })
      .eq("id", id)
      .eq("organization_id", ctx.organizationId)
      .select("id,status,updated_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { success: false, error: "Schedule not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      scheduleId: data.id,
      status: data.status,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to cancel schedule" },
      { status: 400 }
    );
  }
}
