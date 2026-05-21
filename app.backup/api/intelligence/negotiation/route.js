import { NextResponse } from "next/server";

import buildAINegotiationAgent from "@/lib/intelligence/negotiation/buildAINegotiationAgent";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAINegotiationAgent(
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
