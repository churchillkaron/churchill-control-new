import { NextResponse } from "next/server";
import { CapabilityRegistry } from "@/lib/capability-registry";

export async function GET() {
  return NextResponse.json({
    success: true,
    capabilities: CapabilityRegistry.all(),
  });
}
