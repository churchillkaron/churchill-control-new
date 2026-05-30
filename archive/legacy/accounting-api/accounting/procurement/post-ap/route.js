import { NextResponse } from "next/server";
import { postSupplierInvoice } from "@/lib/finance/integrations/postSupplierInvoice";

export async function POST(request) {
  try {
    const body = await request.json();

    const result = await postSupplierInvoice(body);

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
