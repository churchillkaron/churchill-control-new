import { NextResponse } from "next/server";
import { getExecutiveKPIs } from "@/lib/finance/executive/getExecutiveKPIs";

export async function POST() {
  try {
    const kpis = await getExecutiveKPIs();

    return NextResponse.json({
      success: true,
      kpis,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
