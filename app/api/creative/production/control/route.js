export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeProductionControlRuntime,
} from "@/lib/creative/production/control/CreativeProductionControlRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

function identifiers(source = {}) {
  return {
    organization_id:
      source.organization_id || source.organizationId || null,
    creative_project_id:
      source.creative_project_id || source.creativeProjectId || null,
  };
}

async function authorize(organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
  });

  if (!access.success) {
    return {
      response: NextResponse.json(access, {
        status: access.status,
      }),
      access: null,
    };
  }

  return {
    response: null,
    access,
  };
}

export async function GET(req) {
  try {
    const params = Object.fromEntries(
      new URL(req.url).searchParams.entries(),
    );
    const input = identifiers(params);
    const authorization = await authorize(input.organization_id);

    if (authorization.response) return authorization.response;

    const [control, tasks, assets] = await Promise.all([
      CreativeProductionControlRuntime.snapshot(input),
      ProductionTaskRuntime.list(input),
      CreativeAssetGraphRuntime.list(input),
    ]);

    return NextResponse.json({
      success: true,
      control,
      tasks,
      assets,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 400 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const input = identifiers(body);
    const authorization = await authorize(input.organization_id);

    if (authorization.response) return authorization.response;

    const action = String(body.action || "").toUpperCase();
    let result;

    switch (action) {
      case "REGENERATE_TASK_SUBTREE":
        result = await CreativeProductionControlRuntime.regenerateTaskSubtree({
          ...input,
          task_id: body.task_id || body.taskId,
          reason: body.reason,
          requested_by:
            body.requested_by ||
            body.requestedBy ||
            authorization.access?.user?.id ||
            null,
        });
        break;

      case "APPROVE_BUDGET":
        result = await CreativeProductionControlRuntime.approveBudget({
          ...input,
          approved_by:
            body.approved_by ||
            body.approvedBy ||
            authorization.access?.user?.id ||
            null,
          maximum: body.maximum,
          currency: body.currency || "USD",
        });
        break;

      case "RELEASE_DELIVERABLES":
        result = await CreativeProductionControlRuntime.releaseDeliverables({
          ...input,
          approved_by:
            body.approved_by ||
            body.approvedBy ||
            authorization.access?.user?.id ||
            null,
          notes: body.notes || "",
        });
        break;

      default:
        throw new Error("Unsupported Creative production control action");
    }

    return NextResponse.json({
      success: true,
      action,
      result,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 400 });
  }
}
