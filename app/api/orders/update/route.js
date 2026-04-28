import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export async function POST(req) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing order id" },
        { status: 400 }
      );
    }

    // 🔹 UPDATE ORDER STATUS TO PAID
    const { data: order, error } = await supabase
      .from("orders")
      .update({ status: "paid" })
      .eq("id", id)
      .eq("tenant_id", TENANT_ID)
      .select()
      .single();

    if (error || !order) {
      console.error("ORDER UPDATE ERROR:", error);
      return NextResponse.json(
        { error: "Order not found or update failed" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      order,
    });

  } catch (err) {
    console.error("ORDER UPDATE ERROR:", err);

    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}