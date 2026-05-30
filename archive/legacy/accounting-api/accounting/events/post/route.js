import { NextResponse } from "next/server";
import { postAccountingEvent } from "@/lib/finance/postAccountingEvent";

export async function POST(request) {
  try {
    const body = await request.json();

    const result = await postAccountingEvent(body);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      { status: 400 }
    );
  }
}
