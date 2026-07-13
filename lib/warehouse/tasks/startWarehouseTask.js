import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function startWarehouseTask({

  organization_id,

  task_id,

  started_by = null,

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
      .eq("id", task_id)
      .eq(
        "organization_id",
        organization_id
      )
      .single();


  if (error) {
    throw error;
  }


  if (task.status === "COMPLETED") {
    throw new Error("TASK_ALREADY_COMPLETED");
  }


  const {
    data,
    error:updateError,
  } =
    await supabaseAdmin
      .from("warehouse_tasks")
      .update({

        status:
          "IN_PROGRESS",

        started_at:
          new Date().toISOString(),

        started_by,

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


  return {
    success:true,
    task:data,
  };

}
