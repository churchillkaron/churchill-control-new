import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  HotelMaintenanceTransitionError,
  transitionHotelMaintenanceTask,
} from "@/lib/hotel/server/transitionHotelMaintenanceTask";

export const dynamic = "force-dynamic";

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const taskId = String(body.taskId || body.task_id || "").trim();
    const action = String(body.action || "").trim().toUpperCase();

    if (!taskId) return errorResponse("taskId required", 400);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("hotel_maintenance_tasks")
      .select("id,organization_id")
      .eq("id", taskId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing?.organization_id) return errorResponse("Maintenance task not found", 404);

    const access = await requireOrganizationAccess({
      organizationId: existing.organization_id,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const task = await transitionHotelMaintenanceTask({
      supabase: supabaseAdmin,
      organizationId: access.organizationId,
      taskId,
      action,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      task,
    });
  } catch (error) {
    console.error("HOTEL_MAINTENANCE_UPDATE_ERROR", error);
    return errorResponse(
      error?.message || "Maintenance update failed",
      error instanceof HotelMaintenanceTransitionError ? error.status : 500
    );
  }
}
