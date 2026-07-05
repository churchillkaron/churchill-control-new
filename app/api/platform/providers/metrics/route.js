export const dynamic =
  "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  ProviderMetricsRuntime,
} from "@/lib/platform/providers/metrics/ProviderMetricsRuntime";

export async function GET() {

  return NextResponse.json({

    success: true,

    providers:
      ProviderMetricsRuntime.list(),

  });

}
