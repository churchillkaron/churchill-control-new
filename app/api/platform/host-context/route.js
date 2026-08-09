export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  publicPlatformBrand,
  requestPlatformHostname,
} from "@/lib/platform/context/resolvePlatformHostContext";
import {
  resolveRegisteredPlatformHostContext,
} from "@/lib/platform/context/resolveRegisteredPlatformHostContext";

export async function GET(request) {
  try {
    const hostname = requestPlatformHostname(request);
    const context = await resolveRegisteredPlatformHostContext(hostname);

    return NextResponse.json({
      success: true,
      hostname,
      organizationId: context.organizationId || null,
      brand: publicPlatformBrand(context),
    });
  } catch (error) {
    console.error("PLATFORM_HOST_CONTEXT_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to resolve platform host context",
      },
      { status: 500 }
    );
  }
}
