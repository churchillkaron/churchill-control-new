export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { BusinessIntelligenceRuntime } from "@/lib/intelligence/runtime/BusinessIntelligenceRuntime";
import { BusinessIntelligenceAgentRuntime } from "@/lib/intelligence/runtime/BusinessIntelligenceAgentRuntime";
import { classifyBusinessDiagnosisQuestion, resolveBusinessDiagnosisPeriods } from "@/lib/operator/runtime/BusinessPartnerBusinessDiagnosisRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveOrganizationTimeContext } from "@/lib/shared/time/organizationTime";

function cleanValue(value) {
  const normalized = String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized;
}

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status },
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = cleanValue(
      url.searchParams.get("organization_id") ||
      url.searchParams.get("organizationId"),
    );

    if (!organizationId) {
      return errorResponse("organization_id required", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const data = await BusinessIntelligenceRuntime.analyzeOrganization(
      access.organizationId,
    );

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      data,
    });
  } catch (error) {
    console.error("BUSINESS_INTELLIGENCE_GET_ERROR", error);
    return errorResponse(error?.message || "Business intelligence lookup failed");
  }
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function listValue(value) {
  return Array.isArray(value) ? value : [];
}


async function directDiagnosisPeriodRows({ organizationId, entityId = null } = {}) {
  let query = supabaseAdmin
    .from("accounting_periods")
    .select("id,organization_id,entity_id,start_date,end_date,status")
    .eq("organization_id", organizationId)
    .order("start_date", { ascending: false })
    .limit(36);
  if (entityId) query = query.or(`entity_id.eq.${entityId},entity_id.is.null`);
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function resolveDirectDiagnosisPeriods({ organizationId, entityId = null, baselinePeriodId = null, currentPeriodId = null, timezone = "UTC" }) {
  const periods = await resolveBusinessDiagnosisPeriods({
    organizationId,
    entityId,
    baselinePeriodId,
    currentPeriodId,
    timezone,
    loadPeriods: directDiagnosisPeriodRows,
  });
  if (periods.status !== "PERIOD_PAIR_READY") {
    return { success: false, error: `business diagnosis period resolution failed: ${periods.status}`, periods };
  }
  return { success: true, periods };
}

function businessDiagnosisAudit(result = {}) {
  const receipt = objectValue(result.business_diagnosis_receipt);
  const boundary = objectValue(result.business_answer_evidence_boundary);
  return {
    receipt_fingerprint: cleanValue(receipt.receipt_fingerprint),
    receipt_contract: cleanValue(result.business_diagnosis_receipt_contract),
    final_evidence_state: cleanValue(receipt.final_evidence_state),
    diagnosis_class: cleanValue(receipt.diagnosis_class),
    residual_material: receipt.residual_material === true,
    residual_ratio: Number.isFinite(Number(receipt.residual_ratio)) ? Number(receipt.residual_ratio) : null,
    internal_coverage_incomplete: receipt.internal_coverage_incomplete === true,
    supported_external_context_ids: listValue(receipt.supported_external_context_ids),
    validated_external_context_ids: listValue(receipt.validated_external_context_ids),
    rejected_or_unresolved_external_context_count: listValue(receipt.rejected_or_unresolved_external_contexts).length,
    answer_boundary_status: cleanValue(boundary.status || receipt.answer_boundary_status),
    answer_overclaim_detected: boundary.overclaim_detected === true,
    answer_uncertainty_appended: boundary.required_uncertainty_appended === true,
    raw_web_content_exposed: false,
    raw_reasoning_exposed: false,
    authority_effect: "NONE",
  };
}

export async function POST(request) {
  try {
    const body = objectValue(await request.json().catch(() => ({})));
    const organizationId = cleanValue(body.organization_id || body.organizationId);
    const question = cleanValue(body.question || body.message || body.prompt);
    if (!organizationId) return errorResponse("organization_id required", 400);
    if (!question) return errorResponse("question required", 400);

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);

    const diagnosisClassification = classifyBusinessDiagnosisQuestion(question);
    const diagnosisClass = diagnosisClassification.match === true
      ? diagnosisClassification.class
      : "DIRECT_GOVERNED_DIAGNOSIS";
    const requestContext = objectValue(body.context);
    const entityId = cleanValue(body.entity_id || body.entityId);
    const baselinePeriodId = cleanValue(body.baseline_period_id || body.baselinePeriodId || requestContext.baseline_period_id);
    const currentPeriodId = cleanValue(body.current_period_id || body.currentPeriodId || requestContext.current_period_id || body.period_id);
    const organizationTime = await resolveOrganizationTimeContext({ organizationId: access.organizationId, entityId });
    const resolvedPeriods = await resolveDirectDiagnosisPeriods({
      organizationId: access.organizationId,
      entityId,
      baselinePeriodId,
      currentPeriodId,
      timezone: organizationTime.timezone,
    });
    if (!resolvedPeriods.success) return errorResponse(resolvedPeriods.error, 400);
    const context = {
      ...requestContext,
      baseline_period_id: resolvedPeriods.periods.baseline_period_id,
      current_period_id: resolvedPeriods.periods.current_period_id,
      baseline_period_start_date: resolvedPeriods.periods.baseline_start_date,
      baseline_period_end_date: resolvedPeriods.periods.baseline_end_date,
      current_period_start_date: resolvedPeriods.periods.current_start_date,
      current_period_end_date: resolvedPeriods.periods.current_end_date,
      business_timezone: organizationTime.timezone,
      business_diagnosis_class: diagnosisClass,
    };
    const actor = {
      user_id: access.userId,
      email: access.userEmail,
      staff_account_id: access.access?.staffAccountId || null,
      role: access.role || null,
    };
    const result = await BusinessIntelligenceAgentRuntime.run({
      organization_id: access.organizationId,
      entity_id: entityId,
      question,
      messages: listValue(body.messages),
      context,
      actor,
      permissions: listValue(access.permissions),
      callerRequest: request,
      period_id: context.current_period_id,
      mode: cleanValue(body.mode) || "deep",
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      result: result.result,
      audit: businessDiagnosisAudit(result),
    });
  } catch (error) {
    console.error("BUSINESS_INTELLIGENCE_POST_ERROR", error);
    return errorResponse(error?.message || "Business intelligence diagnosis failed");
  }
}
