import { NextResponse } from "next/server";

export async function POST() {

  return NextResponse.json({

    success: true,

    status:
      "worker_runtime_disabled",

  });

}
