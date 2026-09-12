export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  createQuotation,
  listQuotations,
  transitionQuotation,
} from "@/lib/commercial/quotations/QuotationService";
import { projectCommercialMarketingOutcome } from "@/lib/commercial/marketing/projectCommercialMarketingOutcome";

function value(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function errorResponse(error, status = 500) {
  const message = typeof error === "string" ? error : error?.message || String(error || "Request failed");
  const actionIdentityEvidence = Array.isArray(error?.action_identity_evidence) ? error.action_identity_evidence : [];
  return Response.json({ success: false, error: message, ...(actionIdentityEvidence.length ? { action_identity_evidence: actionIdentityEvidence } : {}) }, { status });
}

async function accessForBody(request, body) {
  const access = await requireOrganizationAccess({
    organizationId: value(body, "organizationId", "organization_id"),
    request,
  });

  if (!access.success) {
    return {
      response: errorResponse(access.error, access.status || 403),
      access: null,
    };
  }

  return { response: null, access };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId =
      searchParams.get("organizationId") || searchParams.get("organization_id");
    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      searchParams.get("legalEntityId") ||
      searchParams.get("legal_entity_id");
    const access = await requireOrganizationAccess({ organizationId, request });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
    }

    const quotationId = searchParams.get("quotation_id") || searchParams.get("id");
    const idempotencyKey = searchParams.get("idempotency_key");
    const exactLookup = Boolean(quotationId || idempotencyKey);
    const quotations = await listQuotations({
      organizationId: access.organizationId,
      entityId,
      status: searchParams.get("status"),
      limit: searchParams.get("limit"),
      quotationId,
      idempotencyKey,
    });

    return Response.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entityId,
      quotations,
      rows: quotations,
      ...(exactLookup ? {
        business_effect_outcome: {
          contract: "AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1",
          state: quotations.length ? "COMPLETED" : "NOT_COMPLETED",
          authoritative_server_evidence: true,
          exact_business_scope_matched: true,
          business_effect_observed: quotations.length > 0,
          business_effect_absent: quotations.length === 0,
          safe_to_retry: quotations.length === 0,
          matched_identity: quotations.length ? `quotation_id:${quotations[0].id}` : null,
          derivation: idempotencyKey ? "COMMERCIAL_QUOTATION_IDEMPOTENCY_REINSPECTION" : "COMMERCIAL_QUOTATION_EXACT_ID_REINSPECTION",
        },
      } : {}),
    });
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to load quotations",
      error?.status || 500
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const resolved = await accessForBody(request, body);
    if (resolved.response) return resolved.response;

    const result = await createQuotation({
      access: resolved.access,
      body,
      organizationId: resolved.access.organizationId,
      request,
    });

    const marketing_outcome = await projectCommercialMarketingOutcome({
      organizationId: resolved.access.organizationId,
      body,
      result,
      documentType: "QUOTATION",
      outcomeType: "QUALIFIED_LEAD",
      qualified: true,
      revenue: 0,
      metadata: { commercial_stage: "QUOTATION_CREATED" },
    });

    return Response.json(
      { ...result, marketing_outcome },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    return errorResponse(
      error,
      error?.status || 500
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const resolved = await accessForBody(request, body);
    if (resolved.response) return resolved.response;

    const result = await transitionQuotation({
      access: resolved.access,
      body,
      organizationId: resolved.access.organizationId,
      request,
    });

    const action = String(body.action || "").trim().toUpperCase();
    let marketing_outcome = null;

    if (action === "ACCEPT") {
      marketing_outcome = await projectCommercialMarketingOutcome({
        organizationId: resolved.access.organizationId,
        body,
        result,
        documentType: "QUOTATION",
        outcomeType: "ACCEPTED_QUOTATION",
        qualified: true,
        revenue: 0,
        metadata: { commercial_stage: "QUOTATION_ACCEPTED" },
      });
    }

    return Response.json({ ...result, marketing_outcome });
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to transition quotation",
      error?.status || 500
    );
  }
}
