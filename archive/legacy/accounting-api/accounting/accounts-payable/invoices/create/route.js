import { NextResponse } from "next/server";
import { createAPInvoice } from "@/lib/finance/createAPInvoice";

export async function POST(request) {
  try {
    const body = await request.json();

    const invoice = await createAPInvoice(body);

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
