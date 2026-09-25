import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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

    const { data, error } = await supabaseAdmin
      .from("platform_service_usage")
      .select("id,organization_id,entity_id,category,provider,capability,operation,quantity,unit,supplier_cost,platform_markup,customer_price,currency,status,latency_ms,invoice_status,error_message,created_at,execution_status,provider_model,provider_latency_ms,retry_count,reserved_amount,charged_amount,refunded_amount,billing_completed,finance_posted")
      .eq("organization_id", access.organizationId)
      .order("created_at", {
        ascending: false,
      });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      usage: data || [],
    });
  } catch (error) {
    return errorResponse(error?.message || "Usage lookup failed");
  }
}
