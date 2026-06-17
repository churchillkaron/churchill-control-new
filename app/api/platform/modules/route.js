import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("platform_modules")
    .select("*")
    .order("name");

  if (error) {
    return Response.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }

  return Response.json({
    success: true,
    modules: data || [],
  });
}
