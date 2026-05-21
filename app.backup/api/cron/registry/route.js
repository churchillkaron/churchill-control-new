import { NextResponse } from "next/server";

import { CRON_REGISTRY } from "@/lib/cron/cronRegistry";

export async function GET() {

  return NextResponse.json({
    success: true,
    jobs:
      CRON_REGISTRY,
  });
}
