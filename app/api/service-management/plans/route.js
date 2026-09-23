export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import {
  createServicePlan,
  getServicePlans,
} from "@/lib/service-management/runtime/ServicePlanRuntime";
import { provisionCustomerPortalAccess } from "@/lib/customer-portal/CustomerPortalRuntime";

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Service Management request failed." },
    { status: error?.status || status },
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const rows = await getServicePlans({ context: resolved.context, filters: input });
    return Response.json({
      success: true,
      organization_id: resolved.context.organization_id,
      count: rows.length,
      rows,
    });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const resolved = await resolveServiceManagementContext({ request, input: body });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const row = await createServicePlan({ context: resolved.context, input: body });
    const portalProvisioning = row?.customer_party_id && row?.id
      ? await provisionCustomerPortalAccess({
          organizationId: resolved.context.organization_id,
          partyId: row.customer_party_id,
          sourceType: "SERVICE_PLAN",
          sourceId: row.id,
          deliverIfConversationAvailable: true,
        })
      : null;
    return Response.json({
      success: true,
      row,
      portal_access: portalProvisioning?.access
        ? {
            access_link_id: portalProvisioning.access.access_link_id || null,
            expires_at: portalProvisioning.access.expires_at || null,
          }
        : null,
      portal_provisioning: portalProvisioning
        ? {
            provisioned: portalProvisioning.provisioned,
            delivery: portalProvisioning.delivery || null,
            error: portalProvisioning.error,
          }
        : null,
    }, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}
