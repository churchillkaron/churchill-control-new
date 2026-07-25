export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { loadPeriodCloseChecklist } from "@/lib/finance/period-close/runtime/PeriodCloseStepApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = required(
      searchParams.get("organization_id") || searchParams.get("organizationId"),
      "organization_id"
    );
    const access = await requireOrganizationAccess({ organizationId });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const checklist = await loadPeriodCloseChecklist({
      organizationId: access.organizationId,
      entityId: required(
        searchParams.get("entity_id") || searchParams.get("entityId"),
        "entity_id"
      ),
      periodId: required(
        searchParams.get("period_id") || searchParams.get("periodId"),
        "period_id"
      ),
    });

    const completedByType = new Map(
      (checklist.steps || []).map(step => [step.step_type, step])
    );
    const rows = [
      ...checklist.required_steps,
      ...checklist.year_end_steps,
    ].map(stepType => {
      const completed = completedByType.get(stepType);
      return {
        id: `${checklist.period.id}:${stepType}`,
        period_id: checklist.period.id,
        period: checklist.period.period_name || checklist.period.id,
        step_type: stepType,
        name: stepType
          .toLowerCase()
          .split("_")
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" "),
        status: completed?.status || "PENDING",
        evidence: completed?.evidence || {},
        journal_entry_id: completed?.journal_entry_id || null,
        completed_at: completed?.completed_at || null,
        execute_api: "/api/finance/period-close/steps",
      };
    });
    const monthEndReady = checklist.required_steps.every(
      stepType => ["COMPLETED", "SKIPPED"].includes(
        String(completedByType.get(stepType)?.status || "").toUpperCase()
      )
    );
    const yearEndReady = monthEndReady && checklist.year_end_steps.every(
      stepType => ["COMPLETED", "SKIPPED"].includes(
        String(completedByType.get(stepType)?.status || "").toUpperCase()
      )
    );

    return NextResponse.json({
      success: true,
      rows,
      period: checklist.period,
      currency_code: checklist.currency_code,
      month_end_ready: monthEndReady,
      year_end_ready: yearEndReady,
      closeReadiness: monthEndReady ? "READY" : "ATTENTION",
    });
  } catch (error) {
    const message = error.message || "Period close runtime failed";
    const status = /required|outside|closed|locked/i.test(message) ? 400 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
