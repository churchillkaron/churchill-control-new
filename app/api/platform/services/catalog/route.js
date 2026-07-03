export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { SERVICE_CATALOG, PROVIDER_CATALOG } from "@/lib/platform/service-runtime/services/catalog/ServiceCatalog";

export async function GET() {
  return NextResponse.json({
    categories: SERVICE_CATALOG,
    providers: PROVIDER_CATALOG,
  });
}
