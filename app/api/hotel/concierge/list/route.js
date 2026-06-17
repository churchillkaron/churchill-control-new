import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const organization = await getActiveOrganization();

    if (!organization) {
      return new Response(JSON.stringify({ error: "Organization not found" }), { status: 400 });
    }

    const { data, error } = await supabase
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

    if (error) throw error;

    return new Response(JSON.stringify({ requests: data || [] }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
