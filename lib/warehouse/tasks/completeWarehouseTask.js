import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  createInventoryMovement,
} from "@/lib/inventory/movements/createInventoryMovement";


export async function completeWarehouseTask({

  organization_id,

  entity_id,

  task_id,

  location_id,

  assigned_to = null,

}) {


  if (!organization_id) {
    throw new Error("organization_id required");
  }


  if (!task_id) {
    throw new Error("task_id required");
  }


  const {
    data: task,
    error,
  } =
    await supabaseAdmin
      .from("warehouse_tasks")
      .select("*")
      .eq(
        "id",
        task_id
      )
      .eq(
        "organization_id",
        organization_id
      )
      .single();


  if (error) {
    throw error;
  }


  if (
    (
      task.task_type === "PUTAWAY"
    )
    &&
    !location_id
  ) {

    throw new Error(
      "location_id required for PUTAWAY"
    );

  }


  let movement = null;


  if (
    (
      task.task_type === "PUTAWAY"
      ||
      task.task_type === "TRANSFER"
    )
    &&
    task.item_id
  ) {


    movement =
      await createInventoryMovement({

        organizationId:
          organization_id,

        entityId:
          entity_id ||
          task.entity_id,

        itemId:
          task.item_id,

        movementType:
          task.task_type === "PICK"
            ? "CONSUMPTION"
            : task.task_type === "CYCLE_COUNT"
              ? "ADJUSTMENT_IN"
              : task.task_type,

        quantity:
          task.quantity,

        warehouseId:
          task.warehouse_id,

        locationId:
          location_id,

        referenceType:
          task.source_document,

        referenceId:
          task.source_document_id,

        sourceModule:
          "warehouse",

        sourceDocument:
          "warehouse_task",

        sourceDocumentId:
          task.id,

        notes:
          "Warehouse putaway",

      });

  }


  const {
    data: updated,
    error:updateError,
  } =
    await supabaseAdmin
      .from("warehouse_tasks")
      .update({

        status:
          "COMPLETED",

        assigned_to:
          assigned_to ||
          task.assigned_to ||
          null,

        completed_at:
          new Date().toISOString(),

        updated_at:
          new Date().toISOString(),

      })
      .eq(
        "id",
        task.id
      )
      .select()
      .single();


  if (updateError) {
    throw updateError;
  }


  await supabaseAdmin
    .from("assignments")
    .update({

      status:
        "COMPLETED",

      completed_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      "source_type",
      "warehouse_task"
    )
    .eq(
      "source_id",
      task.id
    )
    .eq(
      "status",
      "ACTIVE"
    );


  return {

    success:true,

    task:
      updated,

    movement,

  };

}
