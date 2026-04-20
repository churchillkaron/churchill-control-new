import { NextResponse } from "next/server";
import { invoices } from "../route";

// 🔥 UPDATE INVOICE STATUS (APPROVE / REJECT)
export async function POST(req) {
  try {
    const body = await req.json();
    const { id, status } = body;

    // VALIDATION
    if (!id || !status) {
      return NextResponse.json(
        { error: "Missing id or status" },
        { status: 400 }
      );
    }

    const invoice = invoices.find((i) => i.id === id);

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // 🔥 UPDATE STATUS
    invoice.status = status;

    // 🔥 META TRACKING
    if (status === "approved") {
      invoice.approvedAt = new Date().toISOString();
      invoice.rejectedAt = null;
    }

    if (status === "rejected") {
      invoice.rejectedAt = new Date().toISOString();
      invoice.approvedAt = null;
    }

    return NextResponse.json({
      success: true,
      invoice,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update invoice" },
      { status: 500 }
    );
  }
}