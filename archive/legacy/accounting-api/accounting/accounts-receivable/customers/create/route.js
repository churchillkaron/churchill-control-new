import { NextResponse } from "next/server";
import { createCustomer } from "@/lib/finance/createCustomer";

export async function POST(request) {
  try {
    const body = await request.json();

    const customer = await createCustomer(body);

    return NextResponse.json({
      success: true,
      customer,
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
