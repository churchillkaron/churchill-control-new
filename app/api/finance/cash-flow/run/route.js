export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import buildCashFlowProjection from "@/lib/finance/treasury/buildCashFlowProjection";

async function execute(request, input) {
  const access = await requireOrganizationAccess({
    organizationId: input.organizationId || input.organization_id,
    request,
  });

  if (!access.success) {
    return NextResponse.json({ success: false, error: access.error }, { status: access.status });
  }

  await requireFinanceWorkspacePermission({
    capabilityId: "cash_flow",
    operation: "read",
    access,
  });

  const entityId = input.entityId || input.entity_id || null;
  if (!entityId) {
    return NextResponse.json({ success: false, error: "entity_id required" }, { status: 400 });
  }

  const entity = await resolveEntity({ organizationId: access.organizationId, entityId });
  if (!entity) {
    return NextResponse.json(
      { success: false, error: "Legal entity not found in organisation" },
      { status: 404 }
    );
  }

  const cashFlow = await buildCashFlowProjection({
    organizationId: access.organizationId,
    entityId: entity.id,
    asOfDate: input.asOfDate || input.as_of_date || null,
    historyDays: input.historyDays || input.history_days || 28,
    horizonDays: input.horizonDays || input.horizon_days || 91,
    grain: input.grain || "week",
  });

  return NextResponse.json({ success: true, cashFlow, rows: cashFlow.rows, ...cashFlow });
}

function errorResponse(error) {
  const message = error?.message || "Cash flow report failed";
  const status = /permission denied/i.test(message)
    ? 403
    : /required|not found/i.test(message)
      ? 400
      : 500;
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    return await execute(request, Object.fromEntries(searchParams.entries()));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    return await execute(request, await request.json());
  } catch (error) {
    return errorResponse(error);
  }
}
