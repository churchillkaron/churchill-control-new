import { NextResponse } from "next/server";
import { ContextRegistry } from "@/lib/context-registry";

export async function GET(
  request,
  { params }
) {
  const context =
    ContextRegistry.get(
      params.contextId
    );

  if (!context) {
    return NextResponse.json(
      {
        success: false,
        error: "CONTEXT_NOT_FOUND",
      },
      {
        status: 404,
      }
    );
  }

  return NextResponse.json({
    success: true,
    context,
  });
}
