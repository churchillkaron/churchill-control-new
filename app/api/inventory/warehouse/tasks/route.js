export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { listWarehouseTasks } from "@/lib/operations/tasks/listWarehouseTasks";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const entityId = searchParams.get("entityId");
    const taskType = searchParams.get("task_type");

    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "entityId required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      request,
      organizationId,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    const tasks = await listWarehouseTasks({
      organization_id: access.organizationId,
      entity_id: entityId,
      task_type: taskType,
    });

    return NextResponse.json({ success: true, tasks });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 },
    );
  }
}
