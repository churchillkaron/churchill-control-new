import { NextResponse } from "next/server";

import {
  execute,
} from "@/lib/restaurant/kitchen/repositories/GetKitchenQueue";

export async function POST(req) {

  const body =
    await req.json();

  const result =
    await execute({
      organizationId:
        body.organizationId,
      station:
        body.station || null,
    });

  return NextResponse.json({
    success: true,
    result,
  });

}
