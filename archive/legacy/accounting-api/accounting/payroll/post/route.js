import { NextResponse } from "next/server";
import { postPayroll } from "@/lib/finance/integrations/postPayroll";

export async function POST(request) {
  try {
    const body = await request.json();

    const result = await postPayroll(body);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
