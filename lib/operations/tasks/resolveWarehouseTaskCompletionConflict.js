import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { normalizeInventoryMovementType } from "@/lib/inventory/movements/inventoryMovementSemantics";

function isRecoverableConflict(error) {
  return error?.code === "23505" || error?.status === 409;
}

async function loadTask({ organizationId, taskId }) {
  const result = await supabaseAdmin
    .from("warehouse_tasks")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", taskId)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data || null;
}

async function loadMovements({ organizationId, taskId }) {
  const result = await supabaseAdmin
    .from("inventory_movements")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("source_module", "warehouse")
    .eq("source_document", "warehouse_task")
    .eq("source_document_id", taskId)
    .order("created_at", { ascending: true });

  if (result.error) throw result.error;
  return result.data || [];
}

export async function resolveWarehouseTaskCompletionConflict({
  organization_id,
  task_id,
  error,
}) {
  if (!organization_id || !task_id || !isRecoverableConflict(error)) {
    return null;
  }

  const task = await loadTask({
    organizationId: organization_id,
    taskId: task_id,
  });

  if (!task) return null;

  if (normalizeInventoryMovementType(task.status) === "COMPLETED") {
    const movements = await loadMovements({
      organizationId: organization_id,
      taskId: task_id,
    });

    return {
      status: 200,
      body: {
        success: true,
        duplicate: true,
        task,
        movements,
        movement: movements[movements.length - 1] || null,
      },
    };
  }

  if (error?.code === "23505") {
    return {
      status: 409,
      body: {
        success: false,
        error: "Warehouse task completion is already in progress",
      },
    };
  }

  return null;
}
