import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";
import {
  HotelBookingTransitionError,
  transitionHotelBooking,
} from "@/lib/hotel/server/transitionHotelBooking";

export async function POST(request) {
  try {
    const body = await request.json();
    const supabase = createServerSupabase(request);
    const organization = await getActiveOrganization(
      body.organizationId
    );

    if (!organization) {
      return Response.json(
        { error: "Organization not found" },
        { status: 400 }
      );
    }

    const booking = await transitionHotelBooking({
      supabase,
      organizationId: organization.id,
      bookingId: body.bookingId,
      action: "CHECK_IN",
    });

    return Response.json({
      success: true,
      booking,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error?.message ||
          "Unable to check in hotel booking",
      },
      {
        status:
          error instanceof HotelBookingTransitionError
            ? error.status
            : 500,
      }
    );
  }
}
