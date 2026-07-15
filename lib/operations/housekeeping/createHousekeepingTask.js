import { supabase } from "@/lib/shared/supabase/client";

export async function createHousekeepingTask({
  organizationId,
  roomId,
  assignedStaffId = null,
  taskType = "CLEANING",
  status = "PENDING",
  scheduledAt = null,
  notes = null,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!roomId) throw new Error("roomId required");

  const { data, error } = await supabase
    .from("hotel_housekeeping_tasks")
    .insert({
      organization_id: organizationId,
      room_id: roomId,
      assigned_staff_id: assignedStaffId,
      task_type: taskType,
      status,
      scheduled_at: scheduledAt,
      notes,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}
