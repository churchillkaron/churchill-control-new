export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  ProductionRuntime,
} from "@/lib/creative/production/runtime/ProductionRuntime";
import {
  ProductionQueueRuntime,
} from "@/lib/creative/production/queue/runtime/ProductionQueueRuntime";
import {
  CreativeVideoProductionReadinessRuntime,
} from "@/lib/creative/video/runtime/CreativeVideoProductionReadinessRuntime";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function creativeProjectId(input = {}) {
  return (
    input.creative_project_id ||
    input.creativeProjectId ||
    null
  );
}

function errorStatus(error) {
  const status = Number(error?.status);
  return Number.isFinite(status) && status >= 400 && status <= 599 ? status : 500;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    const projectId =
      searchParams.get("creativeProjectId") ||
      searchParams.get("creative_project_id");

    const access = await requireOrganizationAccess({
      organizationId,
    });

    if (!access.success) {
      return NextResponse.json(access, {
        status: access.status,
      });
    }

    const queue = await ProductionQueueRuntime.build({
      organization_id: organizationId,
      creative_project_id: projectId,
    });
    const readiness = await CreativeVideoProductionReadinessRuntime.inspect({ queue });

    return NextResponse.json({
      success: true,
      queue,
      readiness,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      readiness: error?.readiness || null,
      coverage: error?.coverage || null,
    }, {
      status: errorStatus(error),
    });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const organizationId =
      body.organization_id ||
      body.organizationId;
    const projectId = creativeProjectId(body);

    const access = await requireOrganizationAccess({
      organizationId,
    });

    if (!access.success) {
      return NextResponse.json(access, {
        status: access.status,
      });
    }

    const result = await ProductionRuntime.runProduction({
      organization_id: organizationId,
      creative_project_id: projectId,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      readiness: error?.readiness || null,
      coverage: error?.coverage || null,
    }, {
      status: errorStatus(error),
    });
  }
}