import { NextResponse } from "next/server";
import { WorkflowRegistry } from "@/lib/workflow-registry";

export async function GET() {
  return NextResponse.json({
    success: true,
    workflows: WorkflowRegistry.all(),
  });
}
