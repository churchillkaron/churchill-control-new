import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function getManagementRuntime({

  tenantId,

}) {

  const today =
    new Date()
      .toISOString()
      .split("T")[0];

  const {
    data: shifts,
  } = await supabaseAdmin
    .from("staff_shifts")
    .select("*")
    .eq(
      "tenant_id",
      tenantId
    )
    .gte(
      "clock_in",
      `${today}T00:00:00`
    );

  const {
    data: schedules,
  } = await supabaseAdmin
    .from("staff_schedules")
    .select("*")
    .eq(
      "tenant_id",
      tenantId
    )
    .eq(
      "shift_date",
      today
    );

  const activeShifts =
    (shifts || []).filter(
      shift =>
        !shift.clock_out
    );

  const lateStaff =
    (shifts || []).filter(
      shift =>
        shift.is_late
    );

  const overtimeRisk =
    activeShifts.filter(
      shift => {

        if (
          !shift.clock_in
        ) return false;

        const start =
          new Date(
            shift.clock_in
          );

        const now =
          new Date();

        const workedHours =
          (
            now - start
          ) /
          1000 /
          60 /
          60;

        return workedHours > 8;

      }
    );

  const missingStaff =
    (schedules || []).filter(
      schedule =>

        !activeShifts.find(
          shift =>
            shift.staff_name ===
            schedule.staff_name
        )
    );

  const completedShifts =
    (shifts || []).filter(
      shift =>
        shift.clock_out
    );

  return {

    activeShifts,

    completedShifts,

    lateStaff,

    overtimeRisk,

    missingStaff,

    scheduledStaff:
      schedules || [],

    scheduledToday:
      schedules?.length || 0,

    activeNow:
      activeShifts.length,

    completedToday:
      completedShifts.length,

    absentToday:
      missingStaff.length,

  };

}
