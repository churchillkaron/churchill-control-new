import { NextResponse } from "next/server";

import runAIOrchestrator from "@/lib/ai-agents/orchestrator/runAIOrchestrator";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await runAIOrchestrator({

        tenant_id:
          body.tenant_id || "demo",
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

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
