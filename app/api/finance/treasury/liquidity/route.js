import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getLiquidityAnalysis } from "@/lib/finance/reporting/treasury/getLiquidityAnalysis";

function accessError(access) {
  return NextResponse.json(
    {
      success: false,
      error: access.error,
    },
    {
      status: access.status,
    }
  );
}

export async function POST(request) {
  try {
    const body = await request.json();

    const access =
      await requireOrganizationAccess({
        organizationId:
          body.organizationId ||
          body.organization_id,
      });

    if (!access.success) {
      return accessError(access);
    }

    const liquidity =
      await getLiquidityAnalysis({
        organizationId:
          access.organizationId,
      });

    return NextResponse.json({
      success: true,
      liquidity,
      rows:
        Array.isArray(liquidity)
          ? liquidity
          : [liquidity],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Liquidity refresh failed",
      },
      {
        status: 500,
      }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const requestedOrganizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const access =
      await requireOrganizationAccess({
        organizationId:
          requestedOrganizationId,
      });

    if (!access.success) {
      return accessError(access);
    }

    const liquidity =
      await getLiquidityAnalysis({
        organizationId:
          access.organizationId,
      });

    return NextResponse.json({
      success: true,
      liquidity,
      rows:
        Array.isArray(liquidity)
          ? liquidity
          : [liquidity],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Liquidity load failed",
      },
      {
        status: 500,
      }
    );
  }
}
