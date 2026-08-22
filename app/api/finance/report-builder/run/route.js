export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { run as runReport } from "@/lib/finance/reporting/runtime/ReportingApplicationService";

const EXECUTABLE_REPORTS = new Set([
  "profit_loss",
  "balance_sheet",
  "cash_flow",
  "trial_balance",
]);

function required(value, field) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${field} required`);
  }
  return value;
}

function estimateRowCount(result) {
  if (Array.isArray(result?.rows)) return result.rows.length;
  const document = result?.document;
  if (!document || typeof document !== "object") return 0;

  for (const key of ["rows", "lines", "items", "sections"]) {
    if (Array.isArray(document[key])) return document[key].length;
  }

  return 0;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await requireFinanceWorkspacePermission({
      capabilityId: "report_builder",
      operation: "write",
      access,
    });

    const reportTemplateId = required(
      body.report_template_id || body.reportTemplateId,
      "report_template_id"
    );
    const entityId = required(body.entity_id || body.entityId, "entity_id");
    const periodId = required(body.period_id || body.periodId, "period_id");

    const { data: template, error: templateError } = await supabaseAdmin
      .from("finance_report_templates")
      .select("id, name, report_type, definition_json, status")
      .eq("organization_id", access.organizationId)
      .eq("id", reportTemplateId)
      .maybeSingle();

    if (templateError) throw templateError;
    if (!template) throw new Error("Report Template not found in this organisation");
    if (String(template.status || "").toUpperCase() !== "ACTIVE") {
      throw new Error("Report Template must be active before it can run");
    }

    const reportType = String(template.report_type || "").trim().toLowerCase();
    if (!EXECUTABLE_REPORTS.has(reportType)) {
      throw new Error("Report Template is not bound to a supported Finance report engine");
    }

    const result = await runReport(reportType, {
      organizationId: access.organizationId,
      entityId,
      periodId,
    });

    const now = new Date().toISOString();
    const { data: run, error: runError } = await supabaseAdmin
      .from("finance_report_runs")
      .insert({
        organization_id: access.organizationId,
        entity_id: entityId,
        report_definition_id: null,
        report_template_id: template.id,
        scheduled_report_id: null,
        run_type: "MANUAL",
        row_count: estimateRowCount(result),
        output_format: "JSON",
        output: result,
        status: "COMPLETED",
        error_message: null,
        completed_at: now,
        created_by: access.user?.id || null,
      })
      .select("*")
      .single();

    if (runError) throw runError;

    return NextResponse.json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        report_type: reportType,
      },
      run,
      report: result,
    });
  } catch (error) {
    const message = error?.message || "Finance report execution failed";
    const status = /permission denied/i.test(message)
      ? 403
      : /required|not found|must be active|not bound|supported/i.test(message)
        ? 400
        : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}