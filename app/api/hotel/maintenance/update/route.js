import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";
import {
  transitionHotelMaintenanceTask,
} from "@/lib/hotel/server/transitionHotelMaintenanceTask";

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

    const task = await transitionHotelMaintenanceTask({
      supabase,
      organizationId: organization.id,
      taskId: body.taskId,
      action: body.action,
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
