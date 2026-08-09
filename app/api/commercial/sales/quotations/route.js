export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  createQuotation,
  listQuotations,
  transitionQuotation,
} from "@/lib/commercial/quotations/QuotationService";

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

    return Response.json(result, { status: result.duplicate ? 200 : 201 });
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

    return Response.json(result);
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to transition quotation",
      error?.status || 500
    );
  }
}
