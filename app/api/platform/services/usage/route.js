export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { PlatformServicesRuntime } from "@/lib/platform/service-runtime/runtime/PlatformServicesRuntime";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get("organization_id");

  const data = await PlatformServicesRuntime.usage(organizationId);

  return NextResponse.json({
    success: true,
    data,
  });
}

export async function POST(req) {
  const body = await req.json();

  const data = await PlatformServicesRuntime.recordUsage(body);

  return NextResponse.json({
    success: true,
    data,
  });
}
