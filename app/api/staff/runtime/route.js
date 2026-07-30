export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import buildPeopleRuntime from "@/lib/people/runtime/PeopleRuntime";

const OPTIONAL_SCHEMA_ERRORS = new Set([
  "42P01",
  "42703",
  "PGRST116",
  "PGRST204",
]);

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

  const startTime = schedule.start_time || schedule.starts_at || null;
  if (!startTime) return "UPCOMING";

  const today = getTodayDate();
  const shiftStart = new Date(`${today}T${startTime}`);

  if (!Number.isNaN(shiftStart.getTime()) && new Date() > shiftStart) {
    return "LATE";
  }

  return "UPCOMING";
}

function organizationFromRequest(request) {
  const { searchParams } = new URL(request.url);
  const explicit =
    searchParams.get("organizationId") ||
    searchParams.get("organization_id");

  if (explicit) return explicit;

  const referer = request.headers.get("referer");
  if (!referer) return null;

  try {
    const pathname = new URL(referer).pathname;
    const match = pathname.match(/\/workspace\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function isOptionalSchemaError(error) {
  return Boolean(error && OPTIONAL_SCHEMA_ERRORS.has(error.code));
}

async function loadSchedule({ organizationId, staff }) {
  const today = getTodayDate();
  const staffId = staff?.id || null;
  const staffName = staff?.name || staff?.display_name || null;

  if (!staffId && !staffName) return null;

  let query = supabaseAdmin
    .from("staff_schedules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("shift_date", today);

  query = staffId
    ? query.eq("staff_account_id", staffId)
    : query.eq("staff_name", staffName);

  let result = await query
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!result.error) return result.data || null;
  if (!isOptionalSchemaError(result.error) || !staffName) {
    if (isOptionalSchemaError(result.error)) return null;
    throw result.error;
  }

  result = await supabaseAdmin
    .from("staff_schedules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("staff_name", staffName)
    .eq("shift_date", today)
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error && !isOptionalSchemaError(result.error)) throw result.error;
  return result.data || null;
}

async function loadActiveShift({ organizationId, staff }) {
  const staffId = staff?.id || null;
  const staffName = staff?.name || staff?.display_name || null;

  if (!staffId && !staffName) return null;

  let query = supabaseAdmin
    .from("staff_shifts")
    .select("*")
    .eq("organization_id", organizationId)
    .is("clock_out", null);

  query = staffId
    ? query.eq("staff_account_id", staffId)
    : query.eq("staff_name", staffName);

  let result = await query
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!result.error) return result.data || null;
  if (!isOptionalSchemaError(result.error) || !staffName) {
    if (isOptionalSchemaError(result.error)) return null;
    throw result.error;
  }

  result = await supabaseAdmin
    .from("staff_shifts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("staff_name", staffName)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error && !isOptionalSchemaError(result.error)) throw result.error;
  return result.data || null;
}

export async function GET(request) {
  try {
    const organizationId = organizationFromRequest(request);
    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        { status: access.status || 403 }
      );
    }

    const staff = access.staff || null;
    const [schedule, activeShift] = await Promise.all([
      loadSchedule({ organizationId: access.organizationId, staff }),
      loadActiveShift({ organizationId: access.organizationId, staff }),
    ]);
    const runtime = buildPeopleRuntime({
      staff,
      schedule,
      activeShift,
    });
    const shiftStatus = getShiftStatus({
      activeShift,
      schedule,
    });

    return NextResponse.json({
      success: true,
      identity: {
        organizationId: access.organizationId,
        email: access.user?.email || staff?.email || null,
        staffName: staff?.name || staff?.display_name || null,
        staffId: staff?.id || null,
      },
      staff,
      membership: access.membership || null,
      role: access.role || null,
      permissions: access.permissions || [],
      schedule,
      activeShift,
      shiftActive: Boolean(activeShift),
      shiftDuration: activeShift
        ? formatDuration(activeShift.clock_in)
        : "00:00",
      shiftStatus,
      runtime,
      socialFeed: [
        {
          type: "shift",
          title: runtime.shiftStatus,
          message: runtime.nextShift || "No upcoming shift",
        },
      ],
      aiInsight: `Workforce runtime active. Payroll status: ${runtime.payrollStatus}.`,
    });
  } catch (error) {
    console.error("STAFF RUNTIME ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load staff runtime",
      },
      { status: 500 }
    );
  }
}
