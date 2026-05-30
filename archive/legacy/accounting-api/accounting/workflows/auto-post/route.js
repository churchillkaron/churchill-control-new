import { NextResponse } from "next/server";
import { runAutoPostingWorkflow } from "@/lib/finance/runAutoPostingWorkflow";

export async function POST(request) {
  try {
    const body = await request.json();

    const workflow = await runAutoPostingWorkflow({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      workflow,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
