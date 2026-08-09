import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EDITABLE_FIELDS = [
  "patient_id",
  "admission_date",
  "discharge_date",
  "attending_doctor_id",
  "admission_reason",
  "status",
];

function requestedOrganizationId(request, body = null) {
  const bodyId = body?.organizationId || body?.organization_id || null;
  if (bodyId) return bodyId;
  const { searchParams } = new URL(request.url);
  return searchParams.get("organizationId") || searchParams.get("organization_id") || null;
}

function editablePayload(body = {}) {
  return Object.fromEntries(
    EDITABLE_FIELDS.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]),
  );
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request) {
  try {
    const access = await requireOrganizationAccess({ organizationId: requestedOrganizationId(request), request });
    if (!access.success) return errorResponse(access.error, access.status);

    const { data, error } = await supabaseAdmin
      .from("healthcare_admissions")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("admission_date", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("HEALTHCARE_ADMISSIONS_GET_ERROR", error);
    return errorResponse(error?.message || "Admission lookup failed");
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({ organizationId: requestedOrganizationId(request, body), request });
    if (!access.success) return errorResponse(access.error, access.status);

    const payload = { ...editablePayload(body), organization_id: access.organizationId };
    const { data, error } = await supabaseAdmin.from("healthcare_admissions").insert([payload]).select();
    if (error) throw error;

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("HEALTHCARE_ADMISSIONS_POST_ERROR", error);
    return errorResponse(error?.message || "Admission creation failed");
  }
}
