export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    const result = await supabaseAdmin
      .from("managed_media_campaigns")
      .select(
        "id, organization_id, provider, status, campaign_name, currency, authorized_budget, reserved_amount, settled_amount, released_amount, provider_campaign_id, destination, created_at, updated_at, completed_at"
      )
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (result.error) throw result.error;

    return Response.json({
      success: true,
      organization_id: access.organizationId,
      campaigns: result.data || [],
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Unable to load marketing dashboard",
      },
      { status: error?.status || 500 }
    );
  }
}
