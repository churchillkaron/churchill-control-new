export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const REGISTRY = {
  customers: "/api/customers/export",
  vendors: "/api/finance/vendors/export",
  legal_entities: "/api/finance/legal-entities/export",
  cost_centers: "/api/finance/cost-centers/export",
  bank_accounts: "/api/finance/bank-accounts/export",
};

function normalizeModule(value) {
  return String(value || "").trim().toLowerCase().replace(/-/g, "_");
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const moduleKey = normalizeModule(searchParams.get("module"));
    const organizationId = String(
      searchParams.get("organizationId") || searchParams.get("organization_id") || ""
    ).trim();
    const entityId = String(
      searchParams.get("entityId") || searchParams.get("entity_id") || ""
    ).trim();
    const periodId = String(
      searchParams.get("periodId") || searchParams.get("period_id") || ""
    ).trim();
    const format = String(searchParams.get("format") || "xlsx").trim().toLowerCase();
    const scope = String(searchParams.get("scope") || "current").trim().toLowerCase();

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(access, { status: access.status || 403 });
    }

    const endpoint = REGISTRY[moduleKey];
    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: `Export not configured for ${moduleKey || "workspace"}` },
        { status: 400 }
      );
    }

    const target = new URL(endpoint, request.url);
    target.searchParams.set("organizationId", organizationId);
    target.searchParams.set("organization_id", organizationId);
    if (entityId) {
      target.searchParams.set("entityId", entityId);
      target.searchParams.set("entity_id", entityId);
    }
    if (periodId) {
      target.searchParams.set("periodId", periodId);
      target.searchParams.set("period_id", periodId);
    }
    target.searchParams.set("format", format);
    target.searchParams.set("scope", scope);

    const response = await fetch(target, {
      method: "GET",
      headers: {
        cookie: request.headers.get("cookie") || "",
        authorization: request.headers.get("authorization") || "",
      },
      cache: "no-store",
      redirect: "follow",
    });

    const headers = new Headers();
    for (const name of ["content-type", "content-disposition", "content-length"]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Workspace export failed" },
      { status: 500 }
    );
  }
}
