export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { BusinessIntelligenceRuntime } from "@/lib/intelligence/runtime/BusinessIntelligenceRuntime";
import { BusinessIntelligenceAgentRuntime } from "@/lib/intelligence/runtime/BusinessIntelligenceAgentRuntime";
import { buildBusinessDiagnosisAuditProjectionFromReceipt, verifyBusinessDiagnosisAuditProjection, verifyBusinessDiagnosisAnswerContent, businessDiagnosisProofIntegrityError, BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE } from "@/lib/intelligence/runtime/AvantiqoBusinessDiagnosisReceiptRuntime";
import { verifyBusinessDiagnosisProofAuthenticity, businessDiagnosisProofAuthenticityAcceptable } from "@/lib/intelligence/runtime/AvantiqoBusinessDiagnosisProofAuthenticityRuntime";
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

function errorResponse(error, status = 500, details = null) {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(details ? { details } : {}),
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
  const projection = buildBusinessDiagnosisAuditProjectionFromReceipt(receipt);
  const verification = verifyBusinessDiagnosisAuditProjection({
    receipt_contract: projection.receipt_contract,
    class: projection.diagnosis_class,
    business_timezone: projection.business_timezone,
    answer_content_fingerprint: projection.answer_content_fingerprint,
    receipt_fingerprint: projection.receipt_fingerprint,
    audit_projection_contract: receipt.audit_projection_contract,
    audit_projection_fingerprint: receipt.audit_projection_fingerprint,
    final_evidence_state: projection.final_evidence_state,
    residual_material: projection.residual_material,
    answer_boundary_status: projection.answer_boundary_status,
    answer_unsupported_recommendation_outcome_detected: projection.answer_unsupported_recommendation_outcome_detected,
    validated_external_context_count: projection.validated_external_context_count,
    unresolved_external_context_count: projection.unresolved_external_context_count,
    periods: projection.periods,
  });
  const answerVerification = verifyBusinessDiagnosisAnswerContent({audit_projection_contract:receipt.audit_projection_contract,answer_content_fingerprint:receipt.answer_content_fingerprint}, result?.result?.response || "");
  const authenticityVerification = verifyBusinessDiagnosisProofAuthenticity(receipt);
  const authenticityAcceptable = businessDiagnosisProofAuthenticityAcceptable(authenticityVerification);
  if (verification.status !== "VERIFIED" || answerVerification.status !== "VERIFIED" || !authenticityAcceptable) throw businessDiagnosisProofIntegrityError("DIRECT_API_LIVE_RETURN");
  return {
    ...projection,
    audit_projection_contract: cleanValue(receipt.audit_projection_contract),
    audit_projection_fingerprint: cleanValue(receipt.audit_projection_fingerprint),
    audit_projection_verification_status: verification.status,
    audit_projection_verified: verification.verified === true,
    receipt_contract_verification_status: verification.receipt_verification_status || verification.status,
    answer_content_verification_status: answerVerification.status,
    answer_content_verified: answerVerification.verified === true,
    receipt_contract: cleanValue(result.business_diagnosis_receipt_contract),
    authenticity_contract: cleanValue(receipt.authenticity_contract),
    authenticity_algorithm: cleanValue(receipt.authenticity_algorithm),
    authenticity_key_id: cleanValue(receipt.authenticity_key_id),
    authenticity_status: authenticityVerification.status,
    authenticity_verified: authenticityVerification.verified === true,
    residual_ratio: Number.isFinite(Number(receipt.residual_ratio)) ? Number(receipt.residual_ratio) : null,
    internal_coverage_incomplete: receipt.internal_coverage_incomplete === true,
    supported_external_context_ids: listValue(receipt.supported_external_context_ids),
    validated_external_context_ids: listValue(receipt.validated_external_context_ids),
    rejected_or_unresolved_external_context_count: projection.unresolved_external_context_count,
    answer_overclaim_detected: boundary.overclaim_detected === true,
    answer_uncertainty_appended: boundary.required_uncertainty_appended === true,
    baseline_period_id: projection.periods.baseline_period_id,
    baseline_period_start_date: projection.periods.baseline_start_date,
    baseline_period_end_date: projection.periods.baseline_end_date,
    current_period_id: projection.periods.current_period_id,
    current_period_start_date: projection.periods.current_start_date,
    current_period_end_date: projection.periods.current_end_date,
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
    if (error?.code === BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE) {
      return errorResponse("Business diagnosis proof verification failed", 500, error.details || { code: BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_ERROR_CODE, authority_effect: "NONE" });
    }
    return errorResponse(error?.message || "Business intelligence diagnosis failed");
  }
}
