export const dynamic = "force-dynamic";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const supabaseAdmin = getServiceSupabase();

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      return Response.json({ success: false, error: "organizationId is required" }, { status: 400 });
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return Response.json(
        { success: false, error: access.error || "Organization access denied" },
        { status: access.status || 403 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_campaigns")
      .select("*")
      .eq("id", id)
      .eq("organization_id", access.organizationId)
      .maybeSingle();

    if (error) {
      return Response.json(
        { success: false, error: "Unable to load campaign" },
        { status: 500 },
      );
    }

    if (!data) {
      return Response.json(
        { success: false, error: "Campaign not found for this organization" },
        { status: 404 },
      );
    }

    return Response.json({ success: true, data });
  } catch {
    return Response.json(
      { success: false, error: "Unable to load campaign" },
      { status: 500 },
    );
  }
}
