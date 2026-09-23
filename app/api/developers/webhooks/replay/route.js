import { NextResponse } from "next/server";

import {
  canManageDeveloperWebhooks,
  recordDeveloperSecurityAudit,
  requireDeveloperPortalAccess,
} from "@/lib/developer/DeveloperPortalRuntime";
import { replayDeveloperWebhookDelivery } from "@/lib/developer/DeveloperWebhookRuntime";

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
  const replayKey = String(body.replay_key || body.replayKey || "").trim();
  if (!deliveryId) {
    return NextResponse.json({ success: false, error: "delivery_id required" }, { status: 400 });
  }
  if (replayKey.length < 8 || replayKey.length > 200) {
    return NextResponse.json(
      { success: false, error: "replay_key must be between 8 and 200 characters" },
      { status: 400 },
    );
  }

  try {
    const result = await replayDeveloperWebhookDelivery({
      organizationId: access.organizationId,
      deliveryId,
      replayKey,
      confirmation: body.confirmation,
    });
    await recordDeveloperSecurityAudit({
      organizationId: access.organizationId,
      actorUserId: access.user?.id || null,
      action: "webhook.delivery_replayed",
      targetType: "developer_webhook_delivery",
      targetId: result.delivery_id || deliveryId,
      metadata: {
        source_delivery_id: deliveryId,
        replay_key: replayKey,
        reused: Boolean(result.reused),
        delivered: Boolean(result.delivered),
        response_status: result.status || null,
      },
    });
    return NextResponse.json({ success: true, delivery: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Webhook replay failed" },
      { status: 400 },
    );
  }
}
