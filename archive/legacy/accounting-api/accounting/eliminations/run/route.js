import { NextResponse } from "next/server";
import { runEliminations } from "@/lib/finance/group/runEliminations";

export async function POST(request) {
  try {
    const body = await request.json();

    const eliminations = await runEliminations({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      eliminations,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
