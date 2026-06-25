import { NextResponse } from "next/server";
import { CapabilityRegistry } from "@/lib/capability-registry";

export async function GET(
  request,
  { params }
) {
  const capability =
    CapabilityRegistry.get(params.capabilityId);

  if (!capability) {
    return NextResponse.json(
      {
        success: false,
        error: "CAPABILITY_NOT_FOUND",
      },
      {
        status: 404,
      }
    );
  }

  return NextResponse.json({
    success: true,
    capability,
  });
}
