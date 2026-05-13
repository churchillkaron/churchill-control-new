import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from("approval_rejections")
    .select("*")
    .eq(
      "status",
      "pending_accounting"
    );

  if (error) {

    console.error(error);

    return new Response(
      JSON.stringify([]),
      { status: 200 }
    );

  }

  return new Response(
    JSON.stringify(data || []),
    { status: 200 }
  );

}