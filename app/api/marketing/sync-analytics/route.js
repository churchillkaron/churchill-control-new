export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { calculateCampaignScore } from "@/lib/marketing/ai/scoring/calculateCampaignScore";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { resolveChannelCredential } from "@/lib/platform/channels/helpers/resolveChannelCredential";
import { MetaProvider } from "@/lib/platform/service-runtime/providers/meta/MetaProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MAX_QUEUE_ITEMS = 500;

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

function number(value) {
  const resolved = Number(value || 0);
  return Number.isFinite(resolved) ? resolved : 0;
}

function metricValue(metric) {
  const direct = metric?.values?.[0]?.value;
  const total = metric?.total_value?.value;
  if (typeof direct === "number") return direct;
  if (typeof total === "number") return total;
  return number(direct ?? total);
}

function metricMap(analytics) {
  const result = {};
  for (const metric of Array.isArray(analytics?.data) ? analytics.data : []) {
    if (!metric?.name) continue;
    result[String(metric.name).toLowerCase()] = metricValue(metric);
  }
  return result;
}

function postId(queue) {
  return queue.instagram_post_id || queue.facebook_post_id || queue.post_id || null;
}

async function publishedQueue() {
  const { data, error } = await supabaseAdmin
    .from("campaign_publish_queue")
    .select("id,organization_id,campaign_id,campaign_memory_id,page_id,platform,status,post_id,facebook_post_id,instagram_post_id,published_at")
    .eq("status", "published")
    .not("organization_id", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(MAX_QUEUE_ITEMS);

  if (error) throw error;
  return data || [];
}

async function updateQueueMetrics(queue, metrics, analytics) {
  const { error } = await supabaseAdmin
    .from("campaign_publish_queue")
    .update({
      engagement_likes: Math.round(number(metrics.likes)),
      engagement_comments: Math.round(number(metrics.comments)),
      engagement_shares: Math.round(number(metrics.shares)),
      engagement_saves: Math.round(number(metrics.saved ?? metrics.saves)),
      engagement_reach: Math.round(number(metrics.reach)),
      publish_result: {
        ...(analytics && typeof analytics === "object" ? analytics : {}),
        analytics_synced_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", queue.id)
    .eq("organization_id", queue.organization_id);

  if (error) throw error;
}

async function updateCampaignMemory(queue, score) {
  if (!queue.campaign_memory_id) return;

  const { error } = await supabaseAdmin
    .from("campaign_memory")
    .update({
      engagement_score: score,
      updated_at: new Date().toISOString(),
    })
    .eq("id", queue.campaign_memory_id)
    .eq("organization_id", queue.organization_id);

  if (error) throw error;
}

async function updateMarketingCampaign(queue, score, metrics, analytics) {
  if (!queue.campaign_id) return;

  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("id,organization_id,performance_metrics")
    .eq("id", queue.campaign_id)
    .eq("organization_id", queue.organization_id)
    .maybeSingle();

  if (campaignError) throw campaignError;
  if (!campaign) return;

  const syncedAt = new Date().toISOString();
  const performanceMetrics = {
    ...(campaign.performance_metrics && typeof campaign.performance_metrics === "object"
      ? campaign.performance_metrics
      : {}),
    social: {
      engagement_score: score,
      likes: number(metrics.likes),
      comments: number(metrics.comments),
      shares: number(metrics.shares),
      saves: number(metrics.saved ?? metrics.saves),
      reach: number(metrics.reach),
      impressions: number(metrics.impressions),
      synced_at: syncedAt,
      queue_id: queue.id,
      platform: queue.platform || null,
    },
  };

  const { error: updateError } = await supabaseAdmin
    .from("marketing_campaigns")
    .update({ performance_metrics: performanceMetrics })
    .eq("id", campaign.id)
    .eq("organization_id", queue.organization_id);

  if (updateError) throw updateError;

  const analyticsDate = syncedAt.slice(0, 10);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("marketing_campaign_analytics")
    .select("id")
    .eq("marketing_campaign_id", campaign.id)
    .eq("organization_id", queue.organization_id)
    .eq("analytics_date", analyticsDate)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  const snapshot = {
    marketing_campaign_id: campaign.id,
    organization_id: queue.organization_id,
    analytics_date: analyticsDate,
    impressions: Math.round(number(metrics.impressions)),
    opens: 0,
    clicks: Math.round(number(metrics.clicks)),
    conversions: Math.round(number(metrics.conversions)),
    revenue_generated: number(metrics.revenue_generated),
    conversion_rate: number(metrics.conversion_rate),
    roi_percent: number(metrics.roi_percent),
    engagement_score: score,
    metadata: {
      provider: "meta",
      platform: queue.platform || null,
      queue_id: queue.id,
      post_id: postId(queue),
      analytics,
      synced_at: syncedAt,
    },
  };

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("marketing_campaign_analytics")
      .update(snapshot)
      .eq("id", existing.id)
      .eq("organization_id", queue.organization_id);
    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin
    .from("marketing_campaign_analytics")
    .insert(snapshot);
  if (error) throw error;
}

async function syncQueueItem(queue) {
  const providerPostId = postId(queue);
  if (!providerPostId) {
    return { queue_id: queue.id, status: "skipped", reason: "missing_post_id" };
  }

  const connection = await ChannelConnectionRuntime.get({
    organization_id: queue.organization_id,
    provider: "meta",
  });

  if (!connection || String(connection.status || "").toUpperCase() !== "ACTIVE") {
    return { queue_id: queue.id, status: "skipped", reason: "meta_not_connected" };
  }

  const accessToken = await resolveChannelCredential(connection);
  if (!accessToken) {
    return { queue_id: queue.id, status: "skipped", reason: "meta_credential_missing" };
  }

  const analytics = await MetaProvider.execute({
    capability: "marketing.social.analytics",
    organization_id: queue.organization_id,
    page_id: providerPostId,
    access_token: accessToken,
  });

  const metrics = metricMap(analytics);
  const score = calculateCampaignScore(analytics);

  await updateQueueMetrics(queue, metrics, analytics);
  await updateCampaignMemory(queue, score);
  await updateMarketingCampaign(queue, score, metrics, analytics);

  return { queue_id: queue.id, status: "synced", score };
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const queue = await publishedQueue();
    const results = [];

    for (const item of queue) {
      try {
        results.push(await syncQueueItem(item));
      } catch (error) {
        console.error("MARKETING_ANALYTICS_ITEM_ERROR", {
          queueId: item.id,
          organizationId: item.organization_id,
          error: error?.message || String(error),
        });
        results.push({
          queue_id: item.id,
          status: "failed",
          error: error?.message || "Analytics sync failed",
        });
      }
    }

    const synced = results.filter((item) => item.status === "synced").length;
    const failed = results.filter((item) => item.status === "failed").length;
    const skipped = results.filter((item) => item.status === "skipped").length;

    return NextResponse.json({
      success: failed === 0,
      checked: results.length,
      synced,
      skipped,
      failed,
      results,
    }, { status: failed > 0 ? 207 : 200 });
  } catch (error) {
    console.error("SYNC_ANALYTICS_ERROR", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Marketing analytics sync failed",
      },
      { status: 500 },
    );
  }
}
