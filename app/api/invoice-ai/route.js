import { NextResponse } from "next/server";
import { NATURAL_ACCOUNTS } from "@/lib/accounting/accountingConfig";

// 🔥 In-memory DB (replace later with real DB)
let invoices = [];

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

    // 🔥 AUTO CLASSIFICATION
    const classification = classifyInvoice(description);

    const invoice = {
      id: Date.now(),

      vendor,
      amount,
      description,

      // AI result
      category: classification.category,
      department: classification.department,
      type: classification.type,
      confidence: classification.confidence,

      status: "pending_approval",

      createdAt: new Date().toISOString(),
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

// 🔥 SIMPLE AI CLASSIFIER (upgrade later)
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