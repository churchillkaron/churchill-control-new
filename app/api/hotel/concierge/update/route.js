import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";
import {
  transitionHotelConciergeRequest,
} from "@/lib/hotel/server/transitionHotelConciergeRequest";

export async function POST(req) {
  try {
    const body = await req.json();
    const organization = await getActiveOrganization(
      body.organizationId
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
