import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getLiquidityAnalysis } from "@/lib/finance/reporting/treasury/getLiquidityAnalysis";

function accessError(access) {
  return NextResponse.json(
    {
      success: false,
      error: access.error,
      rows: [],
    },
    {
      status: access.status,
    }
  );
}

async function resolveScope(request, body = null) {
  const searchParams = new URL(request.url).searchParams;
  const access = await requireOrganizationAccess({
    organizationId:
      body?.organizationId ||
      body?.organization_id ||
      searchParams.get("organizationId") ||
      searchParams.get("organization_id"),
    request,
  });

  if (!access.success) return { response: accessError(access) };

  const entityId =
    body?.entityId ||
    body?.entity_id ||
    searchParams.get("entityId") ||
    searchParams.get("entity_id");

  if (!entityId) {
    return {
      response: NextResponse.json(
        { success: false, error: "entity_id required", rows: [] },
        { status: 400 }
      ),
    };
  }

  const entity = await resolveEntity({
    organizationId: access.organizationId,
    entityId,
  });

  if (!entity) {
    return {
      response: NextResponse.json(
        { success: false, error: "Legal entity not found in organisation", rows: [] },
        { status: 404 }
      ),
    };
  }

  return { access, entity };
}

async function liquidityResponse(request, body = null) {
  try {
    const scope = await resolveScope(request, body);
    if (scope.response) return scope.response;

    const liquidity = await getLiquidityAnalysis({
      organizationId: scope.access.organizationId,
      entityId: scope.entity.id,
    });

    return NextResponse.json({
      success: true,
      organization_id: scope.access.organizationId,
      entity_id: scope.entity.id,
      liquidity,
      rows: [liquidity],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Liquidity analysis failed",
        rows: [],
      },
      {
        status: /required|not found/i.test(String(error.message || "")) ? 400 : 500,
      }
    );
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return liquidityResponse(request, body);
}

export async function GET(request) {
  return liquidityResponse(request);
}
