import { NextResponse } from "next/server";
import { executeWorkspaceAction } from "@/lib/platform/runtime/WorkspaceActionRuntime";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await executeWorkspaceAction({
      actionId: body.actionId || body.action_id || body.action,
      action: body.action || null,
      capability: body.capability || null,
      context: body.context || {},
      payload: body.payload || {},
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("WORKSPACE_ACTION_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "workspace_action_failed",
      },
      { status: 500 }
    );
  }
}
