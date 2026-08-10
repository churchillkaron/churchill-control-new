import { requireAuth } from "@/lib/shared/auth/requireAuth";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return Response.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("platform_modules")
    .select("id,name,category,description,status,is_core,route,capability")
    .order("name");

  if (error) {
    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    );
  }

  return Response.json({
    success: true,
    modules: data || [],
  });
}
