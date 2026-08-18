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
  return Response.json({ success: false, error }, { status });
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

    const quotations = await listQuotations({
      organizationId: access.organizationId,
      entityId,
      status: searchParams.get("status"),
      limit: searchParams.get("limit"),
    });

    return Response.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entityId,
      quotations,
      rows: quotations,
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
      error?.message || "Unable to create quotation",
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
