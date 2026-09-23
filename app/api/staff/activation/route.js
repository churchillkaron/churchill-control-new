export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { loadStaffActivationStatus } from "@/lib/people/workforce/StaffActivationRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { projectStaffActivation } from "@/lib/people/portal/StaffActivationProjection";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request, allowIncompleteActivation: true });
    if (!context.success) return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    const [activation, organizationsResult] = await Promise.all([
      loadStaffActivationStatus({ organizationId: context.organizationId, staff: context.staff, user: context.user }),
      context.availableOrganizationIds?.length
        ? supabaseAdmin.from("organizations")
            .select("id,name")
            .in("id", context.availableOrganizationIds)
            .order("name", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (organizationsResult.error) throw organizationsResult.error;
    return NextResponse.json({
      success: true,
      activation: projectStaffActivation(activation),
      organizationId: context.organizationId,
      organizations: organizationsResult.data || [],
    });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to load staff activation");
  }
}
