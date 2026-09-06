import { NextResponse } from "next/server";

import { broadcastHotelReadinessChanged } from "@/lib/hotel/server/broadcastHotelReadinessChanged";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });

function governedInspectionMessage(error) {
  const message = clean(error?.message || error?.details || error?.hint);
  const known = [
    "Unsupported Housekeeping inspection outcome",
    "Inspection failure reason is required",
    "Maintenance inspection priority must be NORMAL, HIGH or URGENT",
    "Housekeeping task not found for this organization",
    "Room inspection requires a room-linked Housekeeping task",
    "Task must be AWAITING_INSPECTION before inspection outcome",
    "Housekeeping room was not found for this organization",
    "Room must be CLEAN before inspection outcome",
    "Room still has unresolved maintenance and cannot pass inspection",
    "Room still has another active Housekeeping task and cannot pass inspection",
    "Room is still assigned to an in-house stay and cannot pass inspection",
  ];
  return known.find((entry) => message.includes(entry)) ? message : null;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const taskId = clean(body.taskId || body.task_id);
    const outcome = clean(body.outcome).toUpperCase();
    const reasonCode = clean(body.reasonCode || body.reason_code).toUpperCase();
    const notes = clean(body.notes);
    const maintenancePriority = clean(body.maintenancePriority || body.maintenance_priority || "HIGH").toUpperCase();

    if (!taskId) return fail("taskId required", 400);
    if (!["PASS", "RECLEAN", "MAINTENANCE"].includes(outcome)) return fail("Inspection outcome must be PASS, RECLEAN or MAINTENANCE", 400);
    if (outcome !== "PASS" && !reasonCode) return fail("Inspection failure reason is required", 400);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("hotel_housekeeping_tasks")
      .select("id,organization_id,room_id,task_status")
      .eq("id", taskId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing?.organization_id) return fail("Housekeeping task not found", 404);

    const access = await requireOrganizationAccess({ organizationId: existing.organization_id, request });
    if (!access.success) return fail(access.error, access.status);

    const { data, error } = await supabaseAdmin.rpc("hotel_inspect_housekeeping_task", {
      p_organization_id: access.organizationId,
      p_task_id: taskId,
      p_outcome: outcome,
      p_reason_code: reasonCode || null,
      p_notes: notes || null,
      p_maintenance_priority: maintenancePriority || "HIGH",
      p_inspector_staff_account_id: access.access?.staffAccountId || null,
    });

    if (error) {
      const governed = governedInspectionMessage(error);
      if (governed) return fail(governed, governed.includes("not found") ? 404 : 409);
      throw error;
    }

    await broadcastHotelReadinessChanged({
      organizationId: access.organizationId,
      source: "housekeeping-inspection",
      action: outcome,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      result: data || null,
      authority: {
        taskReauthorizedServerSide: true,
        roomAndTaskLockedAtomically: true,
        inspectionEvidencePersistedAtomically: true,
        maintenanceHandoffAtomic: outcome === "MAINTENANCE",
      },
    });
  } catch (error) {
    console.error("HOTEL_HOUSEKEEPING_INSPECTION_ERROR", error);
    return fail(error?.message || "Housekeeping inspection failed", 500);
  }
}
