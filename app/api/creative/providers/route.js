export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeProviderRuntime,
} from "@/lib/creative/providers/runtime/CreativeProviderRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {
  try {
    const body =
      await req.json();

    const organizationId =
      body.organization_id ||
      body.organizationId;

    const access =
      await requireOrganizationAccess({
        organizationId,
      });

    if (!access.success) {
      return NextResponse.json(
        access,
        { status: access.status }
      );
    }

    const task = {
      ...(body.task || body),
      organization_id:
        organizationId,
    };

    const capability =
      CreativeProviderRuntime.resolveCapability(
        task
      );

    const providers =
      CreativeProviderRuntime.listProvidersForTask(
        task
      );

    const selected =
      CreativeProviderRuntime.chooseProvider({
        task,
        strategy:
          body.strategy ||
          "cost_optimized",
      });

    return NextResponse.json({
      success: true,
      capability,
      selected,
      providers,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
