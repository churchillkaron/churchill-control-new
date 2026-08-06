import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";

export async function GET(req) {
  try {
    const supabase = createServerSupabase(req);
    const requestedOrganizationId =
      req.nextUrl.searchParams.get("organizationId");
    const organization = await getActiveOrganization(
      requestedOrganizationId
    );

    if (!organization) {
      return Response.json(
        { error: "Organization not found" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("hotel_housekeeping_tasks")
      .select(`
        *,
        hotel_rooms (
          room_number,
          room_type,
          status
        )
      `)
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return Response.json({
      tasks: data || [],
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error?.message ||
          "Unable to load housekeeping tasks",
      },
      { status: 500 }
    );
  }
}
