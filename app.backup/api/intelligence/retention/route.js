import { NextResponse } from "next/server";

import buildCustomerRetentionAI from "@/lib/intelligence/retention/buildCustomerRetentionAI";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildCustomerRetentionAI(
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
