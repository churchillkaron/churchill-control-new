import { NextResponse } from "next/server";

import { createPostingRule } from "@/lib/finance/core/createPostingRule";

export async function POST(request) {
  try {
    const body = await request.json();

    const rule = await createPostingRule(body);

    return NextResponse.json({
      success: true,
      rule,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 400,
      }
    );
  }
}
