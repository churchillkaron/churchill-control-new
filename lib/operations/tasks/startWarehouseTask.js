import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { normalizeInventoryMovementType } from "@/lib/inventory/movements/inventoryMovementSemantics";

const EXECUTABLE_WAREHOUSE_TASKS = new Set([
  "PUTAWAY",
  "TRANSFER_OUT",
  "TRANSFER_IN",
]);

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export async function startWarehouseTask({
  organization_id,
  task_id,
  started_by,
}) {
  if (!organization_id) fail("organization_id required");
  if (!task_id) fail("task_id required");
  if (!started_by) fail("Authenticated staff identity is required", 403);

  const taskResult = await supabaseAdmin
    .from("warehouse_tasks")
    .select("*")
    .eq("id", task_id)
    .eq("organization_id", organization_id)
    .maybeSingle();

  if (taskResult.error) throw taskResult.error;
  if (!taskResult.data) fail("Warehouse task not found", 404);

  const task = taskResult.data;
  const taskType = normalizeInventoryMovementType(task.task_type);
  const taskStatus = normalizeInventoryMovementType(task.status);

  if (!EXECUTABLE_WAREHOUSE_TASKS.has(taskType)) {
    fail(`Warehouse task type is not executable: ${taskType || "UNKNOWN"}`, 409);
  }

  if (["COMPLETED", "CANCELLED", "CANCELED", "VOID"].includes(taskStatus)) {
    fail("Warehouse task is not startable", 409);
  }

  if (!task.assigned_to) {
    fail("Warehouse task must be assigned before it can be started", 409);
  }

  if (task.assigned_to !== started_by) {
    fail("Warehouse task is assigned to another staff member", 403);
  }

  if (taskStatus === "IN_PROGRESS") {
    if (task.started_by && task.started_by !== started_by) {
      fail("Warehouse task was started by another staff member", 409);
    }

    if (task.started_by) {
      return {
        success: true,
        duplicate: true,
        task,
      };
    }

    const repairedAt = task.started_at || new Date().toISOString();
    const repairedResult = await supabaseAdmin
      .from("warehouse_tasks")
      .update({
        started_by,
        started_at: repairedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id)
      .eq("organization_id", organization_id)
      .eq("status", task.status)
      .eq("assigned_to", started_by)
      .is("started_by", null)
      .select()
      .maybeSingle();

    if (repairedResult.error) throw repairedResult.error;
    if (!repairedResult.data) {
      fail("Warehouse task changed before start provenance could be recorded", 409);
    }

    return {
      success: true,
      duplicate: true,
      repaired: true,
      task: repairedResult.data,
    };
  }

  if (taskStatus !== "ASSIGNED") {
    fail("Warehouse task must be assigned before it can be started", 409);
  }

  const now = new Date().toISOString();
  const updateResult = await supabaseAdmin
    .from("warehouse_tasks")
    .update({
      status: "IN_PROGRESS",
      started_at: now,
      started_by,
      updated_at: now,
    })
    .eq("id", task.id)
    .eq("organization_id", organization_id)
    .eq("status", task.status)
    .eq("assigned_to", started_by)
    .select()
    .maybeSingle();

  if (updateResult.error) throw updateResult.error;
  if (!updateResult.data) {
    fail("Warehouse task changed before it could be started", 409);
  }

  return {
    success: true,
    duplicate: false,
    task: updateResult.data,
  };
}
