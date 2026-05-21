import { NextResponse } from "next/server";

import runExecutiveAI from "@/lib/ai-finance/executive/runExecutiveAI";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await runExecutiveAI({

        tenant_id:
          body.tenant_id || "demo",
      });

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
