import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  createWarehouseTask,
} from "@/lib/operations/tasks/createWarehouseTask";


export async function createWarehouseTransfer({

  organization_id,

  entity_id,

  from_warehouse_id,

  to_warehouse_id,

  item_id,

  quantity,

  created_by = null,

}) {

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!from_warehouse_id) {
    throw new Error("from_warehouse_id required");
  }

  if (!to_warehouse_id) {
    throw new Error("to_warehouse_id required");
  }


  const {
    data: transfer,
    error,
  } =
    await supabaseAdmin
      .from("warehouse_transfers")
      .insert({

        organization_id,

        entity_id,

        from_warehouse_id,

        to_warehouse_id,

        item_id,

        quantity,

        status:
          "OPEN",

        created_by,

      })
      .select()
      .single();


  if(error){
    throw error;
  }


  await createWarehouseTask({

    organization_id,

    entity_id,

    warehouse_id:
      from_warehouse_id,

    task_type:
      "TRANSFER_OUT",

    source_document:
      "warehouse_transfer",

    source_document_id:
      transfer.id,

    item_id,

    quantity,

    created_by,

  });


  await createWarehouseTask({

    organization_id,

    entity_id,

    warehouse_id:
      to_warehouse_id,

    task_type:
      "TRANSFER_IN",

    source_document:
      "warehouse_transfer",

    source_document_id:
      transfer.id,

    item_id,

    quantity,

    created_by,

  });


  return {

    success:true,

    transfer,

  };

}
