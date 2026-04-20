import { NextResponse } from "next/server";

// 🔥 In-memory DB (replace later with Supabase)
let history = [];

export async function GET() {
  return NextResponse.json(history);
}

export async function POST(req) {
  try {
    const body = await req.json();

    // 🔥 VALIDATION (CORE SAFETY)
    if (!body.revenue) {
      return NextResponse.json(
        { error: "Missing revenue" },
        { status: 400 }
      );
    }

    // 🔥 BUILD CLEAN SNAPSHOT (SYSTEM CORE OBJECT)
    const snapshot = {
      id: Date.now(),
      date: body.date,

      // FINANCIAL
      revenue: body.revenue,
      servicePool: body.servicePool,
      payoutPool: body.payoutPool,

      // PERFORMANCE
      performanceLevel: body.performanceLevel,
      performanceScore: body.performanceScore,
      fohScore: body.fohScore,
      barScore: body.barScore,
      kitchenScore: body.kitchenScore,

      // STAFF
      staff: body.staff || [],

      // MONTHLY SYSTEM
      serviceLevel: body.serviceLevel,

      // 🔥 SYSTEM META
      createdAt: new Date().toISOString(),
    };

    history.push(snapshot);

    return NextResponse.json({
      success: true,
      snapshot,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save history snapshot" },
      { status: 500 }
    );
  }
}