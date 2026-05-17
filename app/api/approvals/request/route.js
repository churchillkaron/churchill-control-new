import { NextResponse } from "next/server";

import createApprovalRequest from "@/lib/approvals/workflows/createApprovalRequest";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await createApprovalRequest(
        body
      );

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}
