export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import buildPeopleRuntime from "@/lib/people/runtime/PeopleRuntime";

function formatDuration(clockIn) {
  if (!clockIn) return "00:00";
  const start = new Date(clockIn).getTime();
  const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const hours = String(Math.floor(diff / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

function getShiftStatus({ activeShift, schedule }) {
  if (activeShift) return "WORKING";
  if (!schedule) return "NO_SHIFT";

  const startTime = schedule.start_time || null;
  if (!startTime) return "UPCOMING";

  const shiftStart = new Date(`${getTodayDate()}T${startTime}`);
  if (!Number.isNaN(shiftStart.getTime()) && new Date() > shiftStart) {
    return "LATE";
  }

  return "UPCOMING";
}

function explicitOrganizationId(request) {
  const { searchParams } = new URL(request.url);
  return (
    searchParams.get("organizationId") ||
    searchParams.get("organization_id") ||
    null
  );
}

async function resolveStaffContext(request) {
  const user = await getServerCurrentUser();
  if (!user) {
    return {
      response: NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  const { data: staff, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  if (!staff) {
    return {
      response: NextResponse.json(
        { success: false, error: "Staff account not found" },
        { status: 404 }
      ),
    };
  }

  const organizationId =
    explicitOrganizationId(request) ||
    staff.active_organization_id ||
    null;

  if (!organizationId) {
    return {
      response: NextResponse.json(
        { success: false, error: "Active organization not found" },
        { status: 409 }
      ),
    };
  }

  const access = await requireOrganizationAccess({
    organizationId,
    request,
  });

  if (!access.success) {
    return {
      response: NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      ),
    };
  }

  return {
    user,
    staff: access.staff || staff,
    access,
  };
}

async function loadSchedule({ organizationId, staffId }) {
  const { data, error } = await supabaseAdmin
    .from("staff_schedules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("shift_date", getTodayDate())
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadActiveShift({ organizationId, staffId }) {
  const { data, error } = await supabaseAdmin
    .from("staff_shifts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function GET(request) {
  try {
    const context = await resolveStaffContext(request);
    if (context.response) return context.response;

    const { staff, access } = context;
    const organizationId = access.organizationId;

    const [schedule, activeShift] = await Promise.all([
      loadSchedule({ organizationId, staffId: staff.id }),
      loadActiveShift({ organizationId, staffId: staff.id }),
    ]);

    const runtime = buildPeopleRuntime({
      staff,
      schedule,
      activeShift,
    });

    return NextResponse.json({
      success: true,
      identity: {
        organizationId,
        partyId: staff.party_id || null,
        staffId: staff.id,
        staffName: staff.name || null,
        email: access.user?.email || staff.email || null,
      },
      staff,
      membership: access.membership || null,
      role: access.role || null,
      permissions: access.permissions || [],
      schedule,
      activeShift,
      shiftActive: Boolean(activeShift),
      shiftDuration: activeShift ? formatDuration(activeShift.clock_in) : "00:00",
      shiftStatus: getShiftStatus({ activeShift, schedule }),
      runtime,
    });
  } catch (error) {
    console.error("STAFF_RUNTIME_ERROR", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load staff runtime",
      },
      { status: 500 }
    );
  }
}
