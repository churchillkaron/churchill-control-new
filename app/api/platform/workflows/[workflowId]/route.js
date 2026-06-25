import { NextResponse } from "next/server";
import { WorkflowRegistry } from "@/lib/workflow-registry";

export async function GET(
  request,
  { params }
) {
  const workflow =
    WorkflowRegistry.get(
      params.workflowId
    );

  if (!workflow) {
    return NextResponse.json(
      {
        success: false,
        error: "WORKFLOW_NOT_FOUND",
      },
      {
        status: 404,
      }
    );
  }

  return NextResponse.json({
    success: true,
    workflow,
  });
}
