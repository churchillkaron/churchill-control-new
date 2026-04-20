import { NextResponse } from "next/server";

// ⚠️ TEMP: simple in-memory store duplication
// (real fix later = database)
let invoices = [];

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

    const invoice = invoices.find((i) => i.id === id);

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    invoice.status = status;

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