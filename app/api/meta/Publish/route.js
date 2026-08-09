export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { resolveChannelCredential } from "@/lib/platform/channels/helpers/resolveChannelCredential";
import { MetaProvider } from "@/lib/platform/service-runtime/providers/meta/MetaProvider";

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const queueId = body.queueId || body.queue_id || null;

    if (!queueId) {
      return errorResponse("Missing queueId", 400);
    }

    const { data: queue, error: queueError } = await supabaseAdmin
      .from("campaign_publish_queue")
      .select("*")
      .eq("id", queueId)
      .maybeSingle();

    if (queueError) {
      throw queueError;
    }

    if (!queue?.organization_id) {
      return errorResponse("Queue item not found", 404);
    }

    const access = await requireOrganizationAccess({
      organizationId: queue.organization_id,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("campaign_memory")
      .select("*")
      .eq("id", queue.campaign_memory_id)
      .eq("organization_id", access.organizationId)
      .maybeSingle();

    if (campaignError) {
      throw campaignError;
    }

    if (!campaign) {
      return errorResponse("Campaign not found", 404);
    }

    const connection = await ChannelConnectionRuntime.get({
      organization_id: access.organizationId,
      provider: "meta",
    });

    if (!connection || String(connection.status || "").toUpperCase() !== "ACTIVE") {
      return errorResponse("No connected Meta provider", 404);
    }

    const pageId = connection.metadata?.page_id || null;
    if (!pageId) {
      return errorResponse("Meta page is not configured", 400);
    }

    const accessToken = await resolveChannelCredential(connection);
    if (!accessToken) {
      return errorResponse("Meta credential missing", 404);
    }

    if (!campaign.image_url || campaign.image_url.includes("localhost")) {
      return errorResponse("Invalid image URL", 400);
    }

    const message = `${campaign.caption || ""}\n\n${campaign.hashtags || ""}`.trim();

    const publishData = await MetaProvider.execute({
      capability: "marketing.facebook.publish",
      organization_id: access.organizationId,
      page_id: pageId,
      access_token: accessToken,
      message,
      image_url: campaign.image_url,
    });

    if (!publishData?.id) {
      return errorResponse("Facebook publish failed", 502);
    }

    const publishedAt = new Date().toISOString();

    const { error: queueUpdateError } = await supabaseAdmin
      .from("campaign_publish_queue")
      .update({
        status: "published",
        published_at: publishedAt,
        post_id: publishData.id,
      })
      .eq("id", queueId)
      .eq("organization_id", access.organizationId);

    if (queueUpdateError) {
      throw queueUpdateError;
    }

    const { error: campaignUpdateError } = await supabaseAdmin
      .from("campaign_memory")
      .update({ status: "published" })
      .eq("id", campaign.id)
      .eq("organization_id", access.organizationId);

    if (campaignUpdateError) {
      throw campaignUpdateError;
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      queueId,
      postId: publishData.id,
      publishedAt,
    });
  } catch (error) {
    console.error("META_PUBLISH_ERROR", error);
    return errorResponse(error?.message || "Meta publish failed", error?.status || 500);
  }
}
