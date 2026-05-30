import { NextResponse } from "next/server";
import { getGroupStructure } from "@/lib/finance/group/getGroupStructure";

export async function GET() {
  try {
    const structure = await getGroupStructure();

    return NextResponse.json({
      success: true,
      structure,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
