import { NextResponse } from "next/server";
import {
  canManageDeveloperWebhooks,
  recordDeveloperSecurityAudit,
  requireDeveloperPortalAccess,
} from "@/lib/developer/DeveloperPortalRuntime";
import { retryDeveloperWebhookDelivery } from "@/lib/developer/DeveloperWebhookRuntime";

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

  const deliveryId = String(body.delivery_id || body.deliveryId || "").trim();
  if (!deliveryId) {
    return NextResponse.json({ success: false, error: "delivery_id required" }, { status: 400 });
  }

  try {
    const result = await retryDeveloperWebhookDelivery({
      organizationId: access.organizationId,
      deliveryId,
    });
    await recordDeveloperSecurityAudit({
      organizationId: access.organizationId,
      actorUserId: access.user?.id || null,
      action: "webhook.delivery_retried",
      targetType: "developer_webhook_delivery",
      targetId: deliveryId,
      metadata: {
        attempt: result.attempt || null,
        delivered: Boolean(result.delivered),
        response_status: result.status || null,
      },
    });
    return NextResponse.json({ success: true, delivery: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Webhook retry failed" },
      { status: 400 },
    );
  }
}
