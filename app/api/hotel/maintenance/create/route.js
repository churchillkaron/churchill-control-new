import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";
import {
  createHotelMaintenanceTask,
} from "@/lib/hotel/server/createHotelMaintenanceTask";

export async function POST(req) {
  try {
    const body = await req.json();
    const supabase = createServerSupabase(req);
    const organization = await getActiveOrganization(
      body.organizationId
    );

    if (!organization) {
      return Response.json(
        { error: "Organization not found" },
        { status: 400 }
      );
    }

    const task = await createHotelMaintenanceTask({
      supabase,
      organizationId: organization.id,
      propertyId: body.propertyId,
      taskType: body.taskType,
      scheduledAt: body.scheduledAt,
      notes: body.notes,
      assignedStaffId: body.assignedStaffId,
    });

    return Response.json({
      success: true,
      task,
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: error.status || 500 }
    );
  }
}
