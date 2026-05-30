import { NextResponse } from "next/server";
import { createLegalEntity } from "@/lib/finance/group/createLegalEntity";

export async function POST(request) {
  try {
    const body = await request.json();

    const entity = await createLegalEntity(body);

    return NextResponse.json({
      success: true,
      entity,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
