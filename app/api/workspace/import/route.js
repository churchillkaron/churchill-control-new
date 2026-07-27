export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const REGISTRY = {
  customers: "/api/customers/import",
  vendors: "/api/finance/vendors/import",
  legal_entities: "/api/finance/legal-entities/import",
  cost_centers: "/api/finance/cost-centers/import",
  bank_accounts: "/api/finance/bank-accounts/import",
};

function normalizeModule(value) {
  return String(value || "").trim().toLowerCase().replace(/-/g, "_");
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const source = String(form.get("source") || "file").trim().toLowerCase();
    const moduleKey = normalizeModule(form.get("module"));
    const organizationId = String(
      form.get("organizationId") || form.get("organization_id") || ""
    ).trim();

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(access, { status: access.status || 403 });
    }

    if (source !== "file") {
      return NextResponse.json(
        { success: false, error: `Import source ${source} is not implemented for the generic importer` },
        { status: 400 }
      );
    }

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, error: "No file uploaded." },
        { status: 400 }
      );
    }

    const endpoint = REGISTRY[moduleKey];
    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: `Import not configured for ${moduleKey || "workspace"}` },
        { status: 400 }
      );
    }

    const forward = new FormData();
    forward.append("file", file);
    forward.append("organizationId", organizationId);
    forward.append("organization_id", organizationId);

    const response = await fetch(new URL(endpoint, request.url), {
      method: "POST",
      headers: {
        cookie: request.headers.get("cookie") || "",
        authorization: request.headers.get("authorization") || "",
      },
      body: forward,
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await response.json();
      return NextResponse.json(json, { status: response.status });
    }

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": contentType || "text/plain" },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Workspace import failed" },
      { status: 500 }
    );
  }
}
