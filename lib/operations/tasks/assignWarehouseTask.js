import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  assignRecord,
} from "@/lib/platform/assignment/runtime";


export async function assignWarehouseTask({

  organization_id,

  task_id,

  assigned_to,

}) {

  if (!organization_id) {
    throw new Error("organization_id required");
  }


  if (!task_id) {
    throw new Error("task_id required");
  }


  if (!assigned_to) {
    throw new Error("assigned_to required");
  }


  const {
    data: staff,
    error: staffError,
  } =
    await supabaseAdmin
      .from("staff_accounts")
      .select(
        "id, party_id"
      )
      .eq(
        "id",
        assigned_to
      )
      .single();


  if (staffError) {
    throw staffError;
  }


  if (!staff.party_id) {
    throw new Error(
      "Assigned staff has no party identity"
    );
  }


  const assignment =
    await assignRecord({

      organizationId:
        organization_id,

      sourceType:
        "warehouse_task",

      sourceId:
        task_id,

      assignedPartyId:
        staff.party_id,

      assignmentType:
        "MANUAL",

    });


  const {
    data: updated,
    error,
  } =
    await supabaseAdmin
      .from("warehouse_tasks")
      .update({

        assigned_to,

        status:
          "ASSIGNED",

        updated_at:
          new Date().toISOString(),

      })
      .eq(
        "id",
        task_id
      )
      .eq(
        "organization_id",
        organization_id
      )
      .select()
      .single();


  if (error) {
    throw error;
  }


  return {

    success:true,

    assignment,

    task:
      updated,

  };

}
