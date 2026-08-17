import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeConceptRuntime,
} from "@/lib/creative/concepts/runtime/CreativeConceptRuntime";

export async function GET(req){

    const access = await requireOrganizationAccess({
      organizationId:
        new URL(req.url).searchParams.get("organization_id") ||
        new URL(req.url).searchParams.get("organizationId"),
      request: req,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

  const { searchParams } =
    new URL(req.url);

  const organization_id =
    searchParams.get("organization_id");

  return NextResponse.json({

    concepts:
      await CreativeConceptRuntime.list(
        organization_id
      ),

  });

}

export async function POST(req){

    const access = await requireOrganizationAccess({
      organizationId:
        new URL(req.url).searchParams.get("organization_id") ||
        new URL(req.url).searchParams.get("organizationId"),
      request: req,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

  return NextResponse.json({

    concept:
      await CreativeConceptRuntime.create(
        await req.json()
      ),

  });

}
