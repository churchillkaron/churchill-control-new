import { supabase } from "@/lib/supabase";

export async function checkInStaff({
  tenantId,
  staffId,
  shiftName,
  scheduledTime,
}) {
  const now = new Date();

  const scheduled =
    new Date(scheduledTime);

  const late =
    Math.max(
      0,
      Math.floor(
        (now - scheduled) /
          60000
      )
    );

  const status =
    late > 15
      ? "late"
      : "present";

  const { data, error } =
    await supabase
      .from("attendance_logs")
      .insert({
        tenant_id: tenantId,
        staff_id: staffId,
        shift_name: shiftName,
        check_in:
          now.toISOString(),
        minutes_late: late,
        attendance_status:
          status,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
