export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { SERVICE_CATALOG } from "@/lib/platform/registry/business-services/BusinessServiceRegistry";
import { buildProviderRegistry } from "@/lib/platform/registry/providers/ProviderRegistry";

export async function GET() {
  return NextResponse.json({
    categories: SERVICE_CATALOG,
    providers: buildProviderRegistry(),
  });
}
