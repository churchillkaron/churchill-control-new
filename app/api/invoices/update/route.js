import { NextResponse } from "next/server";
import { NATURAL_ACCOUNTS } from "@/lib/accounting/accountingConfig";

// 🔥 SHARED IN-MEMORY DB (USED BY UPDATE ROUTE)
export let invoices = [];

export async function GET() {
  return NextResponse.json(invoices);
}

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      vendor = "Unknown",
      amount = 0,
      description = "",
    } = body;

    if (!amount) {
      return NextResponse.json(
        { error: "Missing amount" },
        { status: 400 }
      );
    }

    // 🔥 AUTO CLASSIFICATION
    const classification = classifyInvoice(description);

    const invoice = {
      id: Date.now(),

      vendor,
      amount,
      description,

      // AI classification
      category: classification.category,
      department: classification.department,
      type: classification.type,
      confidence: classification.confidence,

      // STATUS FLOW
      status: "pending_approval",

      // META
      createdAt: new Date().toISOString(),
      approvedAt: null,
      rejectedAt: null,
    };

    invoices.push(invoice);

    return NextResponse.json({
      success: true,
      invoice,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}

// 🔥 SIMPLE AI CLASSIFIER
function classifyInvoice(description) {
  const text = description.toLowerCase();

  for (const type in NATURAL_ACCOUNTS) {
    const departments = NATURAL_ACCOUNTS[type];

    for (const dept in departments) {
      const accounts = departments[dept];

      for (const account of accounts) {
        if (text.includes(account.toLowerCase())) {
          return {
            type,
            department: dept,
            category: account,
            confidence: 0.9,
          };
        }
      }
    }
  }

  // fallback
  return {
    type: "Operating Expense",
    department: "Operations",
    category: "Miscellaneous",
    confidence: 0.3,
  };
}