import { createServerSupabase } from "@/lib/shared/supabase/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";
import {
  transitionHotelConciergeRequest,
} from "@/lib/hotel/server/transitionHotelConciergeRequest";

export async function POST(req) {
  try {
    const body = await req.json();

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request: req,
    });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }
    const organization = await getActiveOrganization(
      access.organizationId
    );

    if (!organization) {
      return Response.json(
        { error: "Organization not found" },
        { status: 400 }
      );
    }

    const request = await transitionHotelConciergeRequest({
      supabase: createServerSupabase(req),
      organizationId: organization.id,
      requestId: body.requestId,
      action: body.action,
    });

    return Response.json({
      success: true,
      request,
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: error.status || 500 }
    );
  }
}
