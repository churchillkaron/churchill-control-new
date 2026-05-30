import { NextResponse } from "next/server";
import { getEnterpriseHealth } from "@/lib/finance/executive/getEnterpriseHealth";

export async function POST() {
  try {
    const health = await getEnterpriseHealth();

    return NextResponse.json({
      success: true,
      health,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
