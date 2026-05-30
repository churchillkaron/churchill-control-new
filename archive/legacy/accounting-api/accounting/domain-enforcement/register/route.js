import { NextResponse } from "next/server";

import { registerDomainRules } from "@/lib/finance/core/registerDomainRules";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const rules =
      await registerDomainRules(
        body
      );

    return NextResponse.json({
      success: true,
      rules,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
