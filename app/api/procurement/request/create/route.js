import { NextResponse } from "next/server";
import createPurchaseRequest from "@/lib/procurement/createPurchaseRequest";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await createPurchaseRequest(body);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
