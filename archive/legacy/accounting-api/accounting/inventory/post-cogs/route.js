import { NextResponse } from "next/server";
import { postCOGS } from "@/lib/finance/integrations/postCOGS";

export async function POST(request) {
  try {
    const body = await request.json();

    const result = await postCOGS(body);

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
