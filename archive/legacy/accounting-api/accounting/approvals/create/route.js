import { NextResponse } from "next/server";
import { createApprovalRequest } from "@/lib/finance/createApprovalRequest";

export async function POST(request) {
  try {
    const body = await request.json();

    const approval = await createApprovalRequest(body);

    return NextResponse.json({
      success: true,
      approval,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
