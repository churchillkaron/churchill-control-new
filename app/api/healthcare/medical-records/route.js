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
      error: error || "Healthcare medical records request failed",
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
      .from("healthcare_medical_records")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("visit_date", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      data: data || [],
    });
  } catch (error) {
    console.error("HEALTHCARE_MEDICAL_RECORDS_GET_ERROR", error);
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

    const {
      organizationId: _organizationId,
      organization_id: _organization_id,
      ...record
    } = body;

    const { data, error } = await supabaseAdmin
      .from("healthcare_medical_records")
      .insert({
        ...record,
        organization_id: access.organizationId,
      })
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
    console.error("HEALTHCARE_MEDICAL_RECORDS_POST_ERROR", error);
    return errorResponse(error?.message);
  }
}
