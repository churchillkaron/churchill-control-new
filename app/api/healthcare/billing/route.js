import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function requestedOrganizationId(request, body = null) {
  if (body) {
    return body.organizationId || body.organization_id || null;
  }

  const { searchParams } = new URL(request.url);
  return (
    searchParams.get("organizationId") ||
    searchParams.get("organization_id") ||
    null
  );
}

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error: error || "Healthcare billing request failed",
    },
    { status }
  );
}

export async function GET(request) {
  try {
    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId(request),
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const { data, error } = await supabaseAdmin
      .from("healthcare_billing")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      data: data || [],
    });
  } catch (error) {
    console.error("HEALTHCARE_BILLING_GET_ERROR", error);
    return errorResponse(error?.message);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId(request, body),
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    if (!body.patient_id) {
      return errorResponse("patient_id required", 400);
    }

    const payload = {
      organization_id: access.organizationId,
      patient_id: body.patient_id,
      invoice_number: body.invoice_number || null,
      subtotal: body.subtotal ?? null,
      tax_amount: body.tax_amount ?? null,
      total_amount: body.total_amount ?? null,
      billing_status: body.billing_status || null,
    };

    const { data, error } = await supabaseAdmin
      .from("healthcare_billing")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      data,
    });
  } catch (error) {
    console.error("HEALTHCARE_BILLING_POST_ERROR", error);
    return errorResponse(error?.message);
  }
}
