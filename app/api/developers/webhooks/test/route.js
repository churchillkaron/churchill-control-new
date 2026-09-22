import { NextResponse } from "next/server";
import {
  canManageDeveloperWebhooks,
  recordDeveloperSecurityAudit,
  requireDeveloperPortalAccess,
} from "@/lib/developer/DeveloperPortalRuntime";
import { deliverDeveloperWebhookEvent } from "@/lib/developer/DeveloperWebhookRuntime";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const access = await requireDeveloperPortalAccess({
    organizationId: body.organization_id || body.organizationId,
    request,
  });
  if (!access.success) {
    return NextResponse.json(
      { success: false, error: access.error || "Developer access required" },
      { status: access.status || 403 },
    );
  }
  if (!canManageDeveloperWebhooks(access)) {
    return NextResponse.json(
      { success: false, error: "Developer webhook management authority required" },
      { status: 403 },
    );
  }
  try {
    const result = await deliverDeveloperWebhookEvent({
      organizationId: access.organizationId,
      environmentId: body.environment_id || body.environmentId || null,
      eventType: "developer.test",
      data: { message: "Avantiqo webhook test", requested_by: access.user?.id || null },
      endpointId: body.endpoint_id || null,
    });
    await recordDeveloperSecurityAudit({
      organizationId: access.organizationId,
      actorUserId: access.user?.id || null,
      action: "webhook.test_sent",
      targetType: "developer_webhook_endpoint",
      targetId: body.endpoint_id || null,
      metadata: { event_id: result.event_id, endpoint_count: result.endpoint_count },
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error?.message || "Webhook test failed";
    const contractError = [
      "DEVELOPER_WEBHOOK_ENVIRONMENT_REQUIRED",
      "DEVELOPER_WEBHOOK_ENVIRONMENT_MISMATCH",
      "DEVELOPER_WEBHOOK_ENDPOINT_INACTIVE",
    ].includes(message);
    return NextResponse.json(
      { success: false, error: message },
      { status: contractError ? 400 : 500 },
    );
  }
}
