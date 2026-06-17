import { createServerSupabase } from "@/lib/shared/supabase/server";

export async function GET(req) {
  try {
    const supabase = createServerSupabase(req);

    const organizationId =
      req.nextUrl.searchParams.get("organizationId");

    const { data, error } = await supabase
      .from("hotel_guests")
      .select("*")
      .eq("organization_id", organizationId)
      .order("first_name", { ascending: true });

    if (error) {
      throw error;
    }

    return Response.json({
      guests: data || [],
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
