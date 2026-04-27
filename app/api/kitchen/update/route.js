import { supabase } from "@/lib/supabase";

export async function POST(req) {
  const { order_id, status } = await req.json();

  const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  if (!order_id || !status) {
    return Response.json({ error: "Missing data" }, { status: 400 });
  }

  try {
    // 🔹 UPDATE ORDER STATUS
    const { error } = await supabase
      .from("orders")
      .update({ kitchen_status: status })
      .eq("id", order_id)
      .eq("tenant_id", tenant_id);

    if (error) {
      console.error("STATUS UPDATE ERROR:", error);
      return Response.json({ error: "Update failed" }, { status: 500 });
    }

    return Response.json({
      success: true,
      order_id,
      status,
    });
  } catch (err) {
    console.error("KITCHEN ERROR:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}