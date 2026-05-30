import { NextResponse } from "next/server";
import { getTreasuryPositions } from "@/lib/finance/enterprise/getTreasuryPositions";

export async function GET() {
  try {
    const treasury = await getTreasuryPositions();

    return NextResponse.json({
      success: true,
      treasury,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
