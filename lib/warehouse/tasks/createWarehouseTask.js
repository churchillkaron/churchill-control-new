import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createWarehouseTask({

  organization_id,

  entity_id,

  warehouse_id,

  location_id = null,

  task_type,

  source_document,

  source_document_id,

  item_id = null,

  quantity = 0,

  status = "OPEN",

  created_by = null,

}) {


  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("warehouse_tasks")
      .insert({

        organization_id,

        entity_id,

        warehouse_id,

        location_id,

        task_type,

        source_document,

        source_document_id,

        item_id,

        quantity,

        status,

        created_by,

      })
      .select()
      .single();


  if(error){

    throw error;

  }


  return data;

}
