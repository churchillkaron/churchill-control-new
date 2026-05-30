import { NextResponse } from "next/server";
import { createARInvoice } from "@/lib/finance/createARInvoice";

export async function POST(request) {
  try {
    const body = await request.json();

    const invoice = await createARInvoice(body);

    return NextResponse.json({
      success: true,
      invoice,
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
