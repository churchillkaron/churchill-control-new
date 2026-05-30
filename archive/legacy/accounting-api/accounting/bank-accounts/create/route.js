import { NextResponse } from "next/server";
import { createBankAccount } from "@/lib/finance/createBankAccount";

export async function POST(request) {
  try {
    const body = await request.json();

    const account = await createBankAccount(body);

    return NextResponse.json({
      success: true,
      account,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
