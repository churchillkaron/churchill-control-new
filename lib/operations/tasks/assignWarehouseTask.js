import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { assignRecord } from "@/lib/platform/assignment/runtime";
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

async function supersedeAssignments({ organizationId, assignmentIds, now }) {
  if (!assignmentIds.length) return;

  const result = await supabaseAdmin
    .from("assignments")
    .update({
      status: "SUPERSEDED",
      completed_at: now,
      updated_at: now,
    })
    .eq("organization_id", organizationId)
    .in("id", assignmentIds)
    .eq("status", "ACTIVE");

  if (result.error) throw result.error;
}

export async function assignWarehouseTask({
  organization_id,
  task_id,
  assigned_to,
  assigned_by,
}) {
  if (!organization_id) fail("organization_id required");
  if (!task_id) fail("task_id required");
  if (!assigned_to) fail("assigned_to required");
  if (!assigned_by) fail("Authenticated assigning staff identity is required", 403);

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
    fail("Warehouse task is not assignable", 409);
  }

  if (taskStatus === "IN_PROGRESS") {
    fail("An in-progress warehouse task cannot be reassigned", 409);
  }

  if (!["OPEN", "ASSIGNED"].includes(taskStatus)) {
    fail(`Warehouse task status is not assignable: ${taskStatus || "UNKNOWN"}`, 409);
  }

  const [staffResult, membershipResult, activeAssignmentsResult] = await Promise.all([
    supabaseAdmin
      .from("staff_accounts")
      .select("id, party_id, active")
      .eq("id", assigned_to)
      .eq("active", true)
      .maybeSingle(),
    supabaseAdmin
      .from("organization_users")
      .select("id, organization_id, staff_account_id, status")
      .eq("organization_id", organization_id)
      .eq("staff_account_id", assigned_to)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("assignments")
      .select("id, assigned_party_id, assigned_by, assigned_at, status")
      .eq("organization_id", organization_id)
      .eq("source_type", "warehouse_task")
      .eq("source_id", task.id)
      .eq("status", "ACTIVE")
      .order("assigned_at", { ascending: false }),
  ]);

  if (staffResult.error) throw staffResult.error;
  if (membershipResult.error) throw membershipResult.error;
  if (activeAssignmentsResult.error) throw activeAssignmentsResult.error;

  const staff = staffResult.data;
  if (!staff) fail("Assigned staff account is not active", 409);
  if (!membershipResult.data) {
    fail("Assigned staff is not an active member of this organization", 403);
  }
  if (!staff.party_id) {
    fail("Assigned staff has no party identity", 409);
  }

  const activeAssignments = activeAssignmentsResult.data || [];
  const matchingAssignment = activeAssignments.find(
    (assignment) => assignment.assigned_party_id === staff.party_id,
  );
  const now = new Date().toISOString();

  if (task.assigned_to === assigned_to && matchingAssignment) {
    await supersedeAssignments({
      organizationId: organization_id,
      assignmentIds: activeAssignments
        .filter((assignment) => assignment.id !== matchingAssignment.id)
        .map((assignment) => assignment.id),
      now,
    });

    if (taskStatus !== "ASSIGNED") {
      fail("Warehouse task assignment state is inconsistent", 409);
    }

    return {
      success: true,
      duplicate: true,
      assignment: matchingAssignment,
      task,
    };
  }

  const assignment = await assignRecord({
    organizationId: organization_id,
    sourceType: "warehouse_task",
    sourceId: task.id,
    assignedPartyId: staff.party_id,
    assignmentType: "MANUAL",
    assignedBy: assigned_by,
  });

  const updateResult = await supabaseAdmin
    .from("warehouse_tasks")
    .update({
      assigned_to,
      status: "ASSIGNED",
      updated_at: now,
    })
    .eq("id", task.id)
    .eq("organization_id", organization_id)
    .eq("status", task.status)
    .select()
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    const rollbackResult = await supabaseAdmin
      .from("assignments")
      .update({
        status: "SUPERSEDED",
        completed_at: now,
        updated_at: now,
      })
      .eq("id", assignment.id)
      .eq("organization_id", organization_id)
      .eq("status", "ACTIVE");

    if (rollbackResult.error) {
      console.error("WAREHOUSE ASSIGNMENT ROLLBACK ERROR", rollbackResult.error);
    }

    if (updateResult.error) throw updateResult.error;
    fail("Warehouse task changed before it could be assigned", 409);
  }

  await supersedeAssignments({
    organizationId: organization_id,
    assignmentIds: activeAssignments.map((activeAssignment) => activeAssignment.id),
    now,
  });

  return {
    success: true,
    duplicate: false,
    assignment,
    task: updateResult.data,
  };
}
