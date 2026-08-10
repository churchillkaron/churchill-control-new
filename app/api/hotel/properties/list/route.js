import { createServerSupabase } from "@/lib/shared/supabase/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(req) {
  try {
    const supabase = createServerSupabase(req);
    const organizationId =
      req.nextUrl.searchParams.get("organizationId") ||
      req.nextUrl.searchParams.get("organization_id");

    const access = await requireOrganizationAccess({
      organizationId,
      request: req,
    });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const { data, error } = await supabase
      .from("hotel_properties")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("name", { ascending: true });

    if (error) throw error;

    return Response.json({
      success: true,
      properties: data || [],
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
