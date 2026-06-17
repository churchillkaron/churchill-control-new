import { createServerSupabase } from "@/lib/shared/supabase/server";

export async function GET(req) {
  try {
    const supabase = createServerSupabase(req);

    const organizationId =
      req.nextUrl.searchParams.get("organizationId");

    const { data, error } = await supabase
      .from("hotel_rooms")
      .select("*")
      .eq("organization_id", organizationId)
      .order("room_number", { ascending: true });

    if (error) {
      throw error;
    }

    return Response.json({
      rooms: data || [],
    });

  } catch (error) {

    return Response.json(
      {
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }
}
