import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("INVOICES FETCH ERROR:", error);
      return Response.json(
        { success: false, invoices: [] },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      invoices: data || [],
    });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return Response.json(
      { success: false, invoices: [] },
      { status: 500 }
    );
  }
}