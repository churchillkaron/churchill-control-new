export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import {
  loadPeriodCloseChecklist,
  runPeriodCloseStep,
} from "@/lib/finance/period-close/runtime/PeriodCloseStepRouter";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  if (/required|invalid|outside|closed|locked|configured|incomplete|failed/i.test(message || "")) return 400;
  return 500;
}

async function authorize({ organizationId, request, permissionKey }) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { response: NextResponse.json({ success: false, error: access.error }, { status: access.status }) };

  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey,
    fullAccess: access.permissions?.includes("*") === true,
  });

  return { access };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = required(
      searchParams.get("organization_id") || searchParams.get("organizationId"),
      "organization_id"
    );
    const auth = await authorize({ organizationId, request, permissionKey: "finance.accounting.view" });
    if (auth.response) return auth.response;

    const result = await loadPeriodCloseChecklist({
      organizationId: auth.access.organizationId,
      entityId: required(searchParams.get("entity_id") || searchParams.get("entityId"), "entity_id"),
      periodId: required(searchParams.get("period_id") || searchParams.get("periodId"), "period_id"),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Period close checklist failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = required(body.organization_id || body.organizationId, "organization_id");
    const auth = await authorize({ organizationId, request, permissionKey: "finance.close.execute" });
    if (auth.response) return auth.response;

    const result = await runPeriodCloseStep({
      ...body,
      organizationId: auth.access.organizationId,
      organization_id: auth.access.organizationId,
      entityId: required(body.entity_id || body.entityId, "entity_id"),
      periodId: required(body.period_id || body.periodId, "period_id"),
      stepType: required(body.step_type || body.stepType, "step_type"),
      completedBy: auth.access.user.id,
      idempotencyKey: required(
        body.idempotency_key || body.idempotencyKey || request.headers.get("idempotency-key"),
        "idempotency_key"
      ),
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error.message || "Period close step failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
