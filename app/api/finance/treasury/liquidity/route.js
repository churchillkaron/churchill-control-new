import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { getLiquidityAnalysis } from "@/lib/finance/reporting/treasury/getLiquidityAnalysis";

function accessError(access) {
  return NextResponse.json(
    { success: false, error: access.error },
    { status: access.status }
  );
}

async function requireBankingView(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return access;

  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.banking.view",
    fullAccess: access.permissions?.includes("*") === true,
  });

  return access;
}

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireBankingView(
      request,
      body.organizationId || body.organization_id
    );

    if (!access.success) return accessError(access);

    const liquidity = await getLiquidityAnalysis({
      organizationId: access.organizationId,
    });

    return NextResponse.json({
      success: true,
      liquidity,
      rows: Array.isArray(liquidity) ? liquidity : [liquidity],
    });
  } catch (error) {
    const message = error.message || "Liquidity refresh failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireBankingView(
      request,
      searchParams.get("organizationId") || searchParams.get("organization_id")
    );

    if (!access.success) return accessError(access);

    const liquidity = await getLiquidityAnalysis({
      organizationId: access.organizationId,
    });

    return NextResponse.json({
      success: true,
      liquidity,
      rows: Array.isArray(liquidity) ? liquidity : [liquidity],
    });
  } catch (error) {
    const message = error.message || "Liquidity load failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
