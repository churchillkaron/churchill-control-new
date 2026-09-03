export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { buildFinanceReviewerEvidence } from "@/lib/finance/practice/FinanceReviewerEvidenceRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(searchParams.get("organizationId") || searchParams.get("organization_id"));
    const runId = clean(searchParams.get("runId") || searchParams.get("run_id"));
    const workItemId = clean(searchParams.get("workItemId") || searchParams.get("work_item_id"));
    if (!runId || !workItemId) return jsonError("runId and workItemId are required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const evidence = await buildFinanceReviewerEvidence({
      accountingFirmId: access.organizationId,
      runId,
      workItemId,
    });

    return NextResponse.json({
      success: true,
      evidence,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error?.message || "Unable to load reviewer evidence cockpit";
    return jsonError(message, /permission denied/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 500);
  }
}
