export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { AvantiqoOutcomeEngineRuntime } from "@/lib/intelligence/runtime/AvantiqoOutcomeEngineRuntime";

function clean(value) {
  const normalized = String(value ?? "").trim();
  return normalized && normalized !== "undefined" && normalized !== "null" ? normalized : null;
}

async function permitted({ access, permissionKey }) {
  if (access.permissions?.includes("*") === true) return true;
  try {
    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey,
      fullAccess: false,
    });
    return true;
  } catch {
    return false;
  }
}
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(searchParams.get("organizationId") || searchParams.get("organization_id"));
    const entityId = clean(searchParams.get("entityId") || searchParams.get("entity_id"));

    if (!organizationId) {
      return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const [allowReceivables, allowPayables] = await Promise.all([
      permitted({ access, permissionKey: "finance.receivables.view" }),
      permitted({ access, permissionKey: "finance.payables.view" }),
    ]);

    if (!allowReceivables && !allowPayables) {
      return NextResponse.json({ success: false, error: "permission denied" }, { status: 403 });
    }
    const data = await AvantiqoOutcomeEngineRuntime.inspectOrganization({
      organizationId: access.organizationId,
      entityId,
      allowReceivables,
      allowPayables,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      data,
      access: {
        receivables: allowReceivables,
        payables: allowPayables,
      },
    });
  } catch (error) {
    console.error("OUTCOME_ENGINE_GET_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Outcome Engine inspection failed" },
      { status: 500 },
    );
  }
}
