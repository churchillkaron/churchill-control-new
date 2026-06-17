import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";

export async function GET(req) {
  try {
    const supabase =
      createServerSupabase(req);

    const organization =
      await getActiveOrganization();

    if (!organization) {
      return Response.json(
        {
          error: "Organization not found",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data,
      error,
    } = await supabase
      .from("hotel_bookings")
      .select(`
        *,
        hotel_rooms (
          room_number,
          room_type
        ),
        hotel_guests (
          full_name
        )
      `)
      .eq(
        "organization_id",
        organization.id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error)
      throw error;

    return Response.json({
      bookings:
        data || [],
    });

  } catch (error) {

    return Response.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }
}
