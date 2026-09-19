export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { syncBankFeedIntegration } from "@/lib/finance/banking/runtime/FinanceBankFeedRuntime";

function text(value) { return String(value ?? "").trim(); }
function statusFor(message) { if (/permission denied/i.test(message)) return 403; if (/required|consent|credential|not found|unsupported/i.test(message)) return 409; return 500; }

export async function POST(request, { params }) {
  try {
    const resolved = await params;
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey: "finance.banking.manage", fullAccess: access.permissions?.includes("*") === true });
    const result = await syncBankFeedIntegration({ organizationId: access.organizationId, integrationId: text(resolved?.integrationId), syncMode: "MANUAL" });
    return NextResponse.json(result);
  } catch (error) {
    const message = error?.message || "Bank feed sync failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
