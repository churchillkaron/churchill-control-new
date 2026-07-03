export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  IntegrationConnectionRuntime,
} from "@/lib/platform/service-runtime/integrations/runtime/IntegrationConnectionRuntime";

export async function GET(request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const organization_id =
      searchParams.get("organization_id");

    if (!organization_id) {
      return NextResponse.json(
        {
          success: false,
          error: "organization_id required",
        },
        { status: 400 }
      );
    }

    const catalog =
      IntegrationConnectionRuntime.catalog();

    const connections =
      await IntegrationConnectionRuntime.list(
        organization_id
      );

    return NextResponse.json({
      success: true,
      catalog,
      connections,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body =
      await request.json();

    if (!body.organization_id) {
      return NextResponse.json(
        {
          success: false,
          error: "organization_id required",
        },
        { status: 400 }
      );
    }

    const connection =
      await IntegrationConnectionRuntime.save(
        body
      );

    return NextResponse.json({
      success: true,
      connection,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
