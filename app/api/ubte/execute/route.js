import { NextResponse } from "next/server";
import { executeWorkspaceAction } from "@/lib/platform/runtime/WorkspaceActionRuntime";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await executeWorkspaceAction({
      actionId: body.action,
      capability:
        body.capability ||
        body.capabilityName ||
        null,
      context: body.context || {},
      payload: body.payload || {},
    });

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }
}
