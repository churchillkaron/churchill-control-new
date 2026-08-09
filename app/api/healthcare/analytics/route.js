import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function requestedOrganizationId(request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("organizationId") || searchParams.get("organization_id") || null;
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request) {
  try {
    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId(request),
      request,
    });

    if (!access.success) return errorResponse(access.error, access.status);

    const organizationId = access.organizationId;
    const [patients, appointments, admissions, beds] = await Promise.all([
      supabaseAdmin.from("healthcare_patients").select("id").eq("organization_id", organizationId),
      supabaseAdmin.from("healthcare_appointments").select("id").eq("organization_id", organizationId),
      supabaseAdmin.from("healthcare_admissions").select("id").eq("organization_id", organizationId),
      supabaseAdmin.from("healthcare_beds").select("id").eq("organization_id", organizationId),
    ]);

    const firstError = [patients.error, appointments.error, admissions.error, beds.error].find(Boolean);
    if (firstError) throw firstError;

    return NextResponse.json({
      success: true,
      analytics: {
        totalPatients: patients.data?.length || 0,
        upcomingAppointments: appointments.data?.length || 0,
        currentAdmissions: admissions.data?.length || 0,
        totalBeds: beds.data?.length || 0,
      },
    });
  } catch (error) {
    console.error("HEALTHCARE_ANALYTICS_ERROR", error);
    return errorResponse(error?.message || "Healthcare analytics failed");
  }
}
