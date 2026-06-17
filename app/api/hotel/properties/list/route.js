import { createServerSupabase } from "@/lib/shared/supabase/server";

export async function GET(req) {
  try {
    const supabase = createServerSupabase(req);

    const organizationId =
      req.nextUrl.searchParams.get("organizationId");

    const { data, error } = await supabase
      .from("hotel_properties")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return Response.json({
      properties: data || [],
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
