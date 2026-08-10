import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["PENDING", "IN_PROGRESS", "COMPLETED"]);

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const taskId = String(body.taskId || body.task_id || "").trim();
    const status = String(body.status || body.task_status || "").trim().toUpperCase();

    if (!taskId) return errorResponse("taskId required", 400);
    if (!ALLOWED_STATUSES.has(status)) {
      return errorResponse("Invalid housekeeping status", 400);
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("hotel_housekeeping_tasks")
      .select("id,organization_id,room_id,task_status")
      .eq("id", taskId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing?.organization_id) return errorResponse("Housekeeping task not found", 404);

    const access = await requireOrganizationAccess({
      organizationId: existing.organization_id,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const completedAt = status === "COMPLETED" ? new Date().toISOString() : null;

    const { data: task, error: taskError } = await supabaseAdmin
      .from("hotel_housekeeping_tasks")
      .update({
        task_status: status,
        completed_at: completedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("organization_id", access.organizationId)
      .select()
      .single();

    if (taskError) throw taskError;

    if (status === "COMPLETED" && existing.room_id) {
      const { error: roomError } = await supabaseAdmin
        .from("hotel_rooms")
        .update({
          status: "AVAILABLE",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.room_id)
        .eq("organization_id", access.organizationId);

      if (roomError) throw roomError;
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      task,
    });
  } catch (error) {
    console.error("HOTEL_HOUSEKEEPING_UPDATE_ERROR", error);
    return errorResponse(error?.message || "Housekeeping update failed");
  }
}
