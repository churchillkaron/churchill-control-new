export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolvePOSApplicationDefinition } from "@/lib/operations/commerce/server/POSApplicationRegistry";

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function errorResponse(error, status) {
  return Response.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

async function loadOrganization(organizationId, access) {
  if (access?.organization?.id === organizationId) {
    return access.organization;
  }

  const result = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data || null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId = readValue(
      body,
      "organizationId",
      "organization_id"
    );
    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
    }

    const organizationId = access.organizationId;
    const organization = await loadOrganization(organizationId, access);
    const application = resolvePOSApplicationDefinition({
      organization,
      requestedApplicationId:
        body.applicationId || body.application_id || request.headers.get("x-pos-application"),
    });

    if (!application) {
      return errorResponse(
        "No POS application is configured for this organization",
        409
      );
    }

    if (typeof application.adapter?.createOrder !== "function") {
      return errorResponse(
        `POS order capture is not available for application ${application.id}`,
        501
      );
    }

    const result = await application.adapter.createOrder({
      body,
      access,
      organization,
      organizationId,
      request,
    });

    return Response.json(result);
  } catch (error) {
    console.error("POS CREATE ERROR", error);

    return errorResponse(
      error?.message || "Unable to create POS order",
      error?.status || 500
    );
  }
}
