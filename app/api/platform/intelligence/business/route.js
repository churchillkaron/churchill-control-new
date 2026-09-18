export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { BusinessIntelligenceRuntime } from "@/lib/intelligence/runtime/BusinessIntelligenceRuntime";
import { BusinessIntelligenceAgentRuntime } from "@/lib/intelligence/runtime/BusinessIntelligenceAgentRuntime";

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

    const context = {
      ...objectValue(body.context),
      baseline_period_id: cleanValue(body.baseline_period_id || body.baselinePeriodId || objectValue(body.context).baseline_period_id),
      current_period_id: cleanValue(body.current_period_id || body.currentPeriodId || objectValue(body.context).current_period_id || body.period_id),
    };
    const actor = {
      user_id: access.userId,
      email: access.userEmail,
      staff_account_id: access.access?.staffAccountId || null,
      role: access.role || null,
    };
    const result = await BusinessIntelligenceAgentRuntime.run({
      organization_id: access.organizationId,
      entity_id: cleanValue(body.entity_id || body.entityId),
      question,
      messages: listValue(body.messages),
      context,
      actor,
      permissions: listValue(access.permissions),
      callerRequest: request,
      period_id: cleanValue(body.period_id || body.periodId || context.current_period_id),
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
