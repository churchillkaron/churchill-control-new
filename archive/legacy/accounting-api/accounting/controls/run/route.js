import { NextResponse } from "next/server";
import { runInternalControls } from "@/lib/finance/governance/runInternalControls";

export async function POST(request) {
  try {
    const body = await request.json();

    const controls = await runInternalControls({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      controls,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
