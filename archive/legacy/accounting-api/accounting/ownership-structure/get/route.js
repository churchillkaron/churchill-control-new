import { NextResponse } from "next/server";
import { getOwnershipStructure } from "@/lib/finance/group/getOwnershipStructure";

export async function GET() {
  try {
    const ownership = await getOwnershipStructure();

    return NextResponse.json({
      success: true,
      ownership,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
