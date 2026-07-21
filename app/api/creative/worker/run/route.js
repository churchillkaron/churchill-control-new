export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";

import {
  CreativeOrchestrationWorker,
} from "@/lib/creative/worker/CreativeOrchestrationWorker";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {
  try {
    const body = await req.json();

    const access = await requireOrganizationAccess({
      organizationId: body.organization_id,
    });

    if (!access.success) {
      return NextResponse.json(access, {
        status: access.status,
      });
    }

    const result = await CreativeOrchestrationWorker.runProject({
      organization_id: body.organization_id,
      creative_project_id: body.creative_project_id,
      max_cycles: Math.max(
        1,
        Math.min(5, Number(body.max_cycles || 1)),
      ),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, {
      status: 500,
    });
  }
}
