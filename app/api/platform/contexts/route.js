import { NextResponse } from "next/server";
import { ContextRegistry } from "@/lib/context-registry";

export async function GET() {
  return NextResponse.json({
    success: true,
    contexts: ContextRegistry.all(),
  });
}
