import { NextResponse } from "next/server";

import {
  bootstrapPlatform,
} from "@/lib/platform/bootstrap";

export async function GET() {

  const platform =
    bootstrapPlatform();

  return NextResponse.json({

    success: true,

    runtime: {

      providers:
        platform.providers,

      services: Object.keys(
        platform.services
      ),

      network: !!platform.network,

    },

  });

}
