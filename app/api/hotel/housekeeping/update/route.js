import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";
import {
  HousekeepingTransitionError,
  transitionHousekeepingTask,
} from "@/lib/hotel/server/transitionHousekeepingTask";

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

    const task = await transitionHousekeepingTask({
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
    const status =
      error instanceof HousekeepingTransitionError
        ? error.status
        : 500;

    return Response.json(
      {
        error:
          error?.message ||
          "Housekeeping transition failed",
      },
      { status }
    );
  }
}
