import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  const body = await req.json();

  const { data, error } = await supabaseAdmin
    .from("invoices")
    .insert(body)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ data });
}
