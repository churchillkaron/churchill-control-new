import { NextResponse } from "next/server";
import { createIntercompanyTransaction } from "@/lib/finance/createIntercompanyTransaction";

export async function POST(request) {
  try {
    const body = await request.json();

    const transaction = await createIntercompanyTransaction(body);

    return NextResponse.json({
      success: true,
      transaction,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
