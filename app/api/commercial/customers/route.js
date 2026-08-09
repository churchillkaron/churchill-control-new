export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  listCustomers,
  upsertCustomerParty,
} from "@/lib/commercial/customers/CustomerService";

function errorResponse(error, status = 500) {
  return Response.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

function requestedOrganizationId(source = {}) {
  return source.organizationId || source.organization_id || null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
    }

    const customers = await listCustomers({
      organizationId: access.organizationId,
      query: searchParams.get("query") || "",
      limit: searchParams.get("limit"),
      partyId:
        searchParams.get("partyId") ||
        searchParams.get("party_id"),
    });

    return Response.json({
      success: true,
      organization_id: access.organizationId,
      rowCount: customers.length,
      rows: customers,
      customers,
    });
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to load customers",
      error?.status || 500
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId(body),
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
    }

    const result = await upsertCustomerParty({
      access,
      body,
      organizationId: access.organizationId,
    });

    return Response.json(result, {
      status: body.party_id || body.partyId ? 200 : 201,
    });
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to save customer",
      error?.status || 500
    );
  }
}
