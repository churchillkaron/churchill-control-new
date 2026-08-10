import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { BillingRuntime } from "@/lib/platform/service-runtime/billing/runtime/BillingRuntime";
import * as BillingRepository from "@/lib/platform/service-runtime/billing/repositories/BillingRepository";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";

export const dynamic = "force-dynamic";

function cleanValue(value) {
  const normalized = String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized;
}

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status },
  );
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = cleanValue(
      searchParams.get("organization_id") ||
      searchParams.get("organizationId"),
    );

    if (!organizationId) {
      return errorResponse("organization_id required", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const rows = await BillingRepository.listServiceUsageInvoices({
      organization_id: access.organizationId,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      rows,
    });
  } catch (error) {
    console.error("SERVICE_BILLING_GET_ERROR", error);
    return errorResponse(error?.message || "Service billing lookup failed");
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const usageId = cleanValue(
      body?.usage_id ||
      body?.usageId,
    );

    if (!usageId) {
      return errorResponse("usage_id required", 400);
    }

    const usage = await UsageRuntime.get(usageId);
    if (!usage?.organization_id) {
      return errorResponse("Usage record not found", 404);
    }

    const access = await requireOrganizationAccess({
      organizationId: usage.organization_id,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const result = await BillingRuntime.billUsage({
      usage_id: usageId,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      ...result,
    });
  } catch (error) {
    console.error("SERVICE_BILLING_POST_ERROR", error);
    return errorResponse(error?.message || "Service billing failed");
  }
}
