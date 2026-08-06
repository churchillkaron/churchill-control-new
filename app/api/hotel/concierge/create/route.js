import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";
import {
  createHotelConciergeRequest,
} from "@/lib/hotel/server/createHotelConciergeRequest";

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

    const request = await createHotelConciergeRequest({
      supabase: createServerSupabase(req),
      organizationId: organization.id,
      propertyId: body.propertyId,
      guestId: body.guestId,
      requestType: body.requestType,
      details: body.details,
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
