export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { calculateCampaignScore } from "@/lib/marketing/ai/scoring/calculateCampaignScore";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { MetaProvider } from "@/lib/platform/service-runtime/providers/meta/MetaProvider";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { resolveChannelCredential } from "@/lib/platform/channels/helpers/resolveChannelCredential";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

function metricValue(payload, name) {
  const metric = Array.isArray(payload?.data)
    ? payload.data.find((row) => row?.name === name)
    : null;
  const value = Number(metric?.values?.[0]?.value || 0);
  return Number.isFinite(value) ? value : 0;
}

function summarizeAnalytics(payloads) {
  const metrics = {
    likes: 0,
    comments: 0,
    shares: 0,
    saved: 0,
    reach: 0,
    impressions: 0,
  };

  for (const payload of payloads) {
    for (const name of Object.keys(metrics)) {
      metrics[name] += metricValue(payload, name);
    }
  }

  return metrics;
}

async function publishedQueueRows(limit) {
  const { data, error } = await supabaseAdmin
    .from("campaign_publish_queue")
    .select("id,campaign_id,organization_id,status,platform,published_platform,post_id,facebook_post_id,instagram_post_id,published_at,updated_at")
    .eq("status", "published")
    .not("campaign_id", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function campaignForQueue(row) {
  const { data, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("id,organization_id,campaign_name,campaign_status,campaign_type,campaign_content,performance_metrics")
    .eq("id", row.campaign_id)
    .eq("organization_id", row.organization_id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchMetaAnalytics({ row, accessToken }) {
  const posts = [
    ["facebook", row.facebook_post_id],
    ["instagram", row.instagram_post_id],
    [row.published_platform || row.platform || "meta", row.post_id],
  ];

  const unique = new Map();
  for (const [platform, postId] of posts) {
    const id = String(postId || "").trim();
    if (id && !unique.has(id)) unique.set(id, platform);
  }

  const results = [];
  for (const [postId, platform] of unique.entries()) {
    const analytics = await MetaProvider.execute({
      capability: "marketing.social.analytics",
      page_id: postId,
      access_token: accessToken,
    });
    results.push({ platform, post_id: postId, analytics });
  }

  return results;
}

async function persistAnalytics({ row, campaign, providerResults }) {
  const payloads = providerResults.map((item) => item.analytics);
  const metrics = summarizeAnalytics(payloads);
  const engagementScore = payloads.reduce(
    (total, payload) => total + calculateCampaignScore(payload),
    0,
  );
  const now = new Date().toISOString();
  const analyticsDate = now.slice(0, 10);

  const performanceMetrics = {
    ...(campaign.performance_metrics || {}),
    social_analytics: {
      engagement_score: engagementScore,
      ...metrics,
      providers: providerResults,
      publish_queue_id: row.id,
      updated_at: now,
    },
  };

  const { error: campaignError } = await supabaseAdmin
    .from("marketing_campaigns")
    .update({ performance_metrics: performanceMetrics })
    .eq("id", campaign.id)
    .eq("organization_id", campaign.organization_id);
  if (campaignError) throw campaignError;

  const { data: existingAnalytics, error: existingError } = await supabaseAdmin
    .from("marketing_campaign_analytics")
    .select("id")
    .eq("marketing_campaign_id", campaign.id)
    .eq("organization_id", campaign.organization_id)
    .eq("analytics_date", analyticsDate)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  const analyticsRow = {
    marketing_campaign_id: campaign.id,
    organization_id: campaign.organization_id,
    analytics_date: analyticsDate,
    impressions: Math.round(metrics.impressions),
    engagement_score: engagementScore,
    metadata: {
      source: "meta_social_analytics",
      publish_queue_id: row.id,
      metrics,
      providers: providerResults,
      synced_at: now,
    },
  };

  if (existingAnalytics?.id) {
    const { error } = await supabaseAdmin
      .from("marketing_campaign_analytics")
      .update(analyticsRow)
      .eq("id", existingAnalytics.id)
      .eq("organization_id", campaign.organization_id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin
      .from("marketing_campaign_analytics")
      .insert(analyticsRow);
    if (error) throw error;
  }

  const { error: queueError } = await supabaseAdmin
    .from("campaign_publish_queue")
    .update({
      engagement_likes: Math.round(metrics.likes),
      engagement_comments: Math.round(metrics.comments),
      engagement_shares: Math.round(metrics.shares),
      engagement_saves: Math.round(metrics.saved),
      engagement_reach: Math.round(metrics.reach),
      updated_at: now,
    })
    .eq("id", row.id)
    .eq("organization_id", campaign.organization_id);
  if (queueError) throw queueError;

  const { data: assetUsage, error: assetUsageError } = await supabaseAdmin
    .from("campaign_asset_usage")
    .select("asset_id")
    .eq("campaign_id", campaign.id)
    .eq("organization_id", campaign.organization_id);
  if (assetUsageError) throw assetUsageError;

  const assetIds = [...new Set((assetUsage || []).map((item) => item.asset_id).filter(Boolean))];
  if (assetIds.length) {
    const { error: assetError } = await supabaseAdmin
      .from("creative_assets")
      .update({
        score: engagementScore,
        performance_score: engagementScore,
        updated_at: now,
      })
      .in("id", assetIds)
      .eq("organization_id", campaign.organization_id);
    if (assetError) throw assetError;
  }

  const { error: memoryError } = await supabaseAdmin
    .from("campaign_memory")
    .update({ engagement_score: engagementScore, updated_at: now })
    .eq("organization_id", campaign.organization_id)
    .or(`campaign_id.eq.${campaign.id},marketing_campaign_id.eq.${campaign.id}`);
  if (memoryError) throw memoryError;

  return { engagementScore, metrics };
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 100, 500));
    const rows = await publishedQueueRows(limit);
    const summary = {
      success: true,
      checked: rows.length,
      synced: 0,
      skipped: 0,
      failed: 0,
      results: [],
    };

    for (const row of rows) {
      try {
        const campaign = await campaignForQueue(row);
        if (!campaign) {
          summary.skipped += 1;
          summary.results.push({ queue_id: row.id, status: "skipped", reason: "campaign_not_found" });
          continue;
        }

        const connection = await ChannelConnectionRuntime.get({
          organization_id: row.organization_id,
          provider_id: "meta",
        });
        if (!connection) {
          summary.skipped += 1;
          summary.results.push({ queue_id: row.id, status: "skipped", reason: "meta_not_connected" });
          continue;
        }

        const accessToken = await resolveChannelCredential(connection);
        if (!accessToken) {
          summary.skipped += 1;
          summary.results.push({ queue_id: row.id, status: "skipped", reason: "meta_credential_unavailable" });
          continue;
        }

        const providerResults = await fetchMetaAnalytics({ row, accessToken });
        if (!providerResults.length) {
          summary.skipped += 1;
          summary.results.push({ queue_id: row.id, status: "skipped", reason: "published_post_id_missing" });
          continue;
        }

        const persisted = await persistAnalytics({ row, campaign, providerResults });
        summary.synced += 1;
        summary.results.push({
          queue_id: row.id,
          campaign_id: campaign.id,
          organization_id: campaign.organization_id,
          status: "synced",
          engagement_score: persisted.engagementScore,
        });
      } catch (error) {
        summary.failed += 1;
        summary.results.push({
          queue_id: row.id,
          campaign_id: row.campaign_id,
          organization_id: row.organization_id,
          status: "failed",
          error: error?.message || "Analytics sync failed",
        });
      }
    }

    return NextResponse.json(summary, {
      status: summary.failed > 0 ? 207 : 200,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Marketing analytics sync failed",
      },
      { status: 500 },
    );
  }
}
