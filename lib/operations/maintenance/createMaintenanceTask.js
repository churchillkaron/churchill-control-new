import { supabase } from "@/lib/shared/supabase/client";

export async function createMaintenanceTask({
  organizationId,
  propertyId,
  assignedStaffId = null,
  taskType = "REPAIR",
  status = "PENDING",
  scheduledAt = null,
  notes = null,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!propertyId) throw new Error("propertyId required");

  const { data, error } = await supabase
    .from("hotel_maintenance_tasks")
    .insert({
      organization_id: organizationId,
      property_id: propertyId,
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
