const METRICS = Object.freeze({
  impressions: ["impressions"],
  reach: ["reach", "unique_reach"],
  views: ["views", "video_views", "plays"],
  engagements: ["engagements", "engagement", "interactions"],
  reactions: ["reactions"],
  likes: ["likes"],
  comments: ["comments"],
  shares: ["shares"],
  saves: ["saves", "bookmarks"],
  clicks: ["clicks", "link_clicks"],
  conversions: ["conversions", "purchases", "leads"],
  revenue: ["revenue", "revenue_generated", "conversion_value"],
  spend: ["spend", "cost", "media_spend"],
  watch_time_seconds: ["watch_time_seconds", "watch_time"],
  average_watch_time_seconds: ["average_watch_time_seconds", "avg_watch_time_seconds"],
  completion_rate: ["completion_rate", "video_completion_rate"],
  engagement_rate: ["engagement_rate"],
  click_through_rate: ["click_through_rate", "ctr"],
  conversion_rate: ["conversion_rate"],
  return_on_ad_spend: ["return_on_ad_spend", "roas"],
});

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function valueFor(source, aliases) {
  for (const alias of aliases) {
    const value = finite(source[alias]);
    if (value !== null) return value;
  }
  return null;
}

function percent(numerator, denominator) {
  return denominator > 0
    ? Number(((numerator / denominator) * 100).toFixed(6))
    : null;
}

export function normalizeCreativeOutcomeMetrics(input = {}) {
  const source = object(input);
  const result = {};

  for (const [name, aliases] of Object.entries(METRICS)) {
    const value = valueFor(source, aliases);
    if (value !== null) result[name] = value;
  }

  if (result.engagement_rate === undefined && result.engagements !== undefined) {
    const value = percent(result.engagements, result.impressions);
    if (value !== null) result.engagement_rate = value;
  }
  if (result.click_through_rate === undefined && result.clicks !== undefined) {
    const value = percent(result.clicks, result.impressions);
    if (value !== null) result.click_through_rate = value;
  }
  if (result.conversion_rate === undefined && result.conversions !== undefined) {
    const value = percent(result.conversions, result.clicks);
    if (value !== null) result.conversion_rate = value;
  }
  if (
    result.return_on_ad_spend === undefined &&
    result.revenue !== undefined &&
    result.spend > 0
  ) {
    result.return_on_ad_spend = Number((result.revenue / result.spend).toFixed(6));
  }

  return result;
}

export function summarizeCreativeOutcomeMetrics(observations = []) {
  const buckets = {};

  for (const observation of observations) {
    for (const [name, raw] of Object.entries(object(observation.normalized_metrics))) {
      const value = finite(raw);
      if (value === null) continue;
      const bucket = buckets[name] || {
        count: 0,
        total: 0,
        minimum: value,
        maximum: value,
      };
      bucket.count += 1;
      bucket.total += value;
      bucket.minimum = Math.min(bucket.minimum, value);
      bucket.maximum = Math.max(bucket.maximum, value);
      buckets[name] = bucket;
    }
  }

  return Object.fromEntries(
    Object.entries(buckets).map(([name, bucket]) => [name, {
      count: bucket.count,
      average: Number((bucket.total / bucket.count).toFixed(6)),
      minimum: bucket.minimum,
      maximum: bucket.maximum,
    }]),
  );
}
