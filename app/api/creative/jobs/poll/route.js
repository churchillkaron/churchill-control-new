export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  CreativeProviderCompletionRuntime,
} from "@/lib/creative/providers/runtime/CreativeProviderCompletionRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(request) {
  try {
    const body = await request.json();
    const taskId = body.task_id || body.taskId;

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: "task_id required" },
        { status: 400 },
      );
    }

    const task = await ProductionTaskRuntime.get(taskId);
    if (!task) {
      return NextResponse.json(
        { success: false, error: "Production task not found" },
        { status: 404 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId: task.organization_id,
    });
    if (!access.success) {
      return NextResponse.json(access, { status: access.status });
    }

    const result = await CreativeProviderCompletionRuntime.poll({
      task_id: task.id,
    });

    return NextResponse.json({
      success: true,
      task: result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
