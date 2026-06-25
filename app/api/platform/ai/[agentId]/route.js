import { NextResponse } from "next/server";
import { AIRegistry } from "@/lib/ai-registry";

export async function GET(
  request,
  { params }
) {
  const agent =
    AIRegistry.get(
      params.agentId
    );

  if (!agent) {
    return NextResponse.json(
      {
        success: false,
        error: "AI_AGENT_NOT_FOUND",
      },
      {
        status: 404,
      }
    );
  }

  return NextResponse.json({
    success: true,
    agent,
  });
}
