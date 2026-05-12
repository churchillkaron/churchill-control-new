import { NextResponse } from "next/server";
import { supabase } from "@/lib/shared/supabase/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;




// ✅ GET (UNCHANGED)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("INVOICES ERROR:", error);
      return NextResponse.json([], {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      });
    }

    return NextResponse.json(data || [], {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (err) {
    console.error("INVOICES SERVER ERROR:", err);
    return NextResponse.json([], {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  }
}

// ✅ NEW: POST (APPROVE / REJECT)
export async function POST(req) {
  try {
    const body = await req.json();

    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "Missing id or status" },
        { status: 400 }
      );
    }

    // 🔒 Allowed transitions only
    const allowed = ["approved_manager", "rejected"];

    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    // 🔎 Get current invoice
    const { data: invoice, error: fetchError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // 🔒 Only allow update from pending
    if (invoice.status !== "pending") {
      return NextResponse.json(
        { error: "Already processed" },
        { status: 400 }
      );
    }

    // ✅ Update status
    const { data, error } = await supabase
      .from("invoices")
      .update({
        status: status,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("UPDATE ERROR:", error);
      return NextResponse.json(
        { error: "Update failed" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 200 });

  } catch (err) {
    console.error("POST ERROR:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}