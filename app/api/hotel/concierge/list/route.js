import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";

export async function GET(req) {
  try {
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

    const { data, error } = await createServerSupabase(req)
      .from("hotel_concierge_requests")
      .select(`
        *,
        hotel_guests (
          first_name,
          last_name
        ),
        hotel_properties (
          name
        )
      `)
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return Response.json({
      requests: data || [],
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: error.status || 500 }
    );
  }
}
