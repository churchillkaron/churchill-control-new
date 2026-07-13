import {
  createWarehouseTask,
} from "@/lib/warehouse/tasks/createWarehouseTask";


export async function createPickTask({

  organization_id,

  entity_id,

  warehouse_id,

  item_id,

  quantity,

  source_document,

  source_document_id,

  created_by = null,

}) {


  return await createWarehouseTask({

    organization_id,

    entity_id,

    warehouse_id,

    task_type:
      "PICK",

    source_document,

    source_document_id,

    item_id,

    quantity,

    created_by,

  });

}
