import { NextResponse } from "next/server";
import { AIRegistry } from "@/lib/ai-registry";

export async function GET() {
  return NextResponse.json({
    success: true,
    agents: AIRegistry.all(),
  });
}
