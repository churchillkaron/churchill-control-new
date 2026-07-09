export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  getErpDomains,
  getErpSolutions,
} from "@/lib/platform/registry/erpRegistry";

export async function GET() {
  const industries =
    getErpSolutions().map((solution) => ({
      industry_id: solution.id,
      name: solution.name,
      route: solution.route,
      runtime: {
        modules: [],
      },
    }));

  const modules =
    getErpDomains().map((domain) => ({
      id: domain.id,
      name: domain.name,
      route: domain.route || null,
      type: domain.type,
      description: domain.description,
    }));

  return NextResponse.json({
    success: true,
    organizations: [],
    industries,
    modules,
  });
}
