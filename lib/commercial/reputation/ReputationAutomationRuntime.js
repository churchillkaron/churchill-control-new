import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  discoverAndRegisterGoogleBusinessLocations,
  getGoogleBusinessAccess,
  listGoogleLocationReviews,
  publishGoogleReviewReply,
} from "./googleBusinessProfile";

const STAR_RATINGS = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

const GOOGLE_DISCOVERY_TRANSIENT_RETRY_MS = 15 * 60 * 1000;
const GOOGLE_DISCOVERY_QUOTA_RETRY_MS = 60 * 60 * 1000;
const GOOGLE_DISCOVERY_MAX_RETRY_MS = 6 * 60 * 60 * 1000;

function numericRating(value) {
  if (typeof value === "string" && STAR_RATINGS[value.toUpperCase()]) {
    return STAR_RATINGS[value.toUpperCase()];
  }
  const rating = Number(value);
  return Number.isFinite(rating) ? rating : 0;
}

function fallbackAnalysis(review, policy) {
  const rating = numericRating(review.rating);
  const brand = policy.brand_name || "our restaurant";

  if (rating >= 4) {
    return {
      response: `Thank you for your kind review. We’re delighted you enjoyed your time at ${brand}, and we look forward to welcoming you back.`,
      language_code: "en",
      sentiment: "POSITIVE",
      sentiment_score: rating >= 5 ? 0.95 : 0.7,
      classification: "PRAISE",
      response_strategy: "THANK_AND_INVITE_BACK",
      ai_generated: false,
    };
  }

  if (rating >= 3) {
    return {
      response: `Thank you for sharing your feedback. We appreciate your visit to ${brand} and will use your comments to keep improving the guest experience.`,
      language_code: "en",
      sentiment: "MIXED",
      sentiment_score: 0,
      classification: "MIXED_EXPERIENCE",
      response_strategy: "ACKNOWLEDGE_AND_IMPROVE",
      ai_generated: false,
    };
  }

  return {
    response: `Thank you for bringing this to our attention. We’re sorry your experience at ${brand} did not meet expectations. Please contact our management team directly so we can understand what happened and follow up properly.`,
    language_code: "en",
    sentiment: "NEGATIVE",
    sentiment_score: -0.9,
    classification: "SERVICE_RECOVERY",
    response_strategy: "ESCALATE_AND_RECOVER",
    ai_generated: false,
  };
}

function parseJsonObject(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

function clampScore(value, fallback) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.max(-1, Math.min(1, score));
}

async function generateResponseAnalysis(review, policy) {
  const fallback = fallbackAnalysis(review, policy);

  try {
    const execution = await ServiceExecutionRuntime.execute({
      organization_id: review.organization_id,
      party_id: review.party_id || null,
      entity_id: review.entity_id || policy.entity_id || null,
      service_id: "ai.text.generate",
      provider_id: "openai",
      input: {
        max_output_tokens: 500,
        prompt: `You write public Google review replies for a restaurant.

Restaurant: ${policy.brand_name}
Brand voice: ${policy.brand_voice}
Default language when there is no written comment: ${policy.default_language || "en"}
Rating: ${numericRating(review.rating)} out of 5
Reviewer: ${review.author_name || "Guest"}
Review: ${review.review_text || "The guest left a rating without written comments."}

Rules:
- Reply in the language used by the reviewer. If there is no written comment, use the policy default language.
- Be warm, sincere, specific only when the review provides the detail, and concise.
- Do not invent facts, discounts, remedies or contact details.
- Do not admit legal liability or disclose private information.
- Do not overuse the reviewer's name.
- For a negative review, acknowledge the concern and invite direct management follow-up without promising compensation.
- The public reply must be no longer than ${policy.max_reply_length || 900} characters.
- Return only valid JSON with this shape:
{"response":"","language_code":"","sentiment":"POSITIVE|MIXED|NEGATIVE","sentiment_score":0,"classification":"PRAISE|MIXED_EXPERIENCE|SERVICE_RECOVERY|GENERAL","response_strategy":""}`,
      },
      metadata: {
        module: "COMMERCIAL_REPUTATION",
        operation: "GENERATE_REVIEW_RESPONSE",
        review_id: review.id,
      },
      category: "AI",
    });

    const raw =
      execution?.output?.text ||
      execution?.output?.output?.text ||
      execution?.output?.result?.text ||
      "";
    const parsed = parseJsonObject(raw);
    const response = String(parsed.response || "").trim();
    if (!response) throw new Error("AI response was empty");

    return {
      ...fallback,
      response: response.slice(0, policy.max_reply_length || 900),
      language_code: String(parsed.language_code || fallback.language_code),
      sentiment: String(parsed.sentiment || fallback.sentiment).toUpperCase(),
      sentiment_score: clampScore(
        parsed.sentiment_score,
        fallback.sentiment_score
      ),
      classification: String(
        parsed.classification || fallback.classification
      ).toUpperCase(),
      response_strategy: String(
        parsed.response_strategy || fallback.response_strategy
      ).toUpperCase(),
      ai_generated: true,
      ai_error: null,
    };
  } catch (error) {
    return {
      ...fallback,
      ai_error: error?.message || "AI response generation failed",
    };
  }
}

async function loadPolicy(organizationId, channelAssetId = null) {
  const { data, error } = await supabaseAdmin
    .from("reputation_review_policies")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const policies = data || [];
  return (
    policies.find((policy) => policy.channel_asset_id === channelAssetId) ||
    policies.find(
      (policy) => !policy.channel_asset_id && !policy.entity_id
    ) ||
    policies[0] ||
    null
  );
}

async function createRecoveryCase(review, analysis) {
  const { error } = await supabaseAdmin
    .from("reputation_recovery_cases")
    .upsert(
      {
        organization_id: review.organization_id,
        entity_id: review.entity_id || null,
        party_id: review.party_id || null,
        review_id: review.id,
        priority: "CRITICAL",
        summary: `${numericRating(review.rating)}-star Google review requires management follow-up`,
        details: {
          author_name: review.author_name || null,
          review_text: review.review_text || null,
          classification: analysis.classification,
          suggested_response: analysis.response,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "review_id" }
    );

  if (error) throw error;
}

async function markProcessing(review) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("reputation_reviews")
    .update({
      response_status: "PROCESSING",
      response_attempts: Number(review.response_attempts || 0) + 1,
      processing_started_at: now,
      last_response_error: null,
      updated_at: now,
    })
    .eq("id", review.id)
    .eq("organization_id", review.organization_id)
    .eq("response_status", review.response_status)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function processReview(review) {
  const claimed = await markProcessing(review);
  if (!claimed) return { reviewId: review.id, skipped: true };

  const policy = await loadPolicy(
    claimed.organization_id,
    claimed.channel_asset_id
  );
  if (!policy) {
    await supabaseAdmin
      .from("reputation_reviews")
      .update({
        response_status: "SKIPPED",
        last_response_error: "No active review response policy",
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimed.id);
    return { reviewId: claimed.id, skipped: true, reason: "NO_POLICY" };
  }

  const analysis = await generateResponseAnalysis(claimed, policy);
  const rating = numericRating(claimed.rating);
  const now = new Date().toISOString();
  const autoPublish = rating >= Number(policy.auto_publish_min_rating || 5);
  const critical = rating <= Number(policy.critical_max_rating || 2);
  const nextStatus = autoPublish
    ? "PUBLISHING"
    : "PENDING_APPROVAL";

  const { error: draftError } = await supabaseAdmin
    .from("reputation_reviews")
    .update({
      response_text: analysis.response,
      response_status: nextStatus,
      language_code: analysis.language_code,
      sentiment: analysis.sentiment,
      sentiment_score: analysis.sentiment_score,
      classification: analysis.classification,
      response_strategy: analysis.response_strategy,
      response_generated_at: now,
      processing_started_at: null,
      metadata: {
        ...(claimed.metadata || {}),
        response_generation: {
          ai_generated: analysis.ai_generated,
          ai_error: analysis.ai_error || null,
        },
      },
      updated_at: now,
    })
    .eq("id", claimed.id)
    .eq("organization_id", claimed.organization_id);

  if (draftError) throw draftError;

  if (!autoPublish) {
    if (critical) await createRecoveryCase(claimed, analysis);
    return { reviewId: claimed.id, status: nextStatus, published: false };
  }

  try {
    const reply = await publishGoogleReviewReply({
      organizationId: claimed.organization_id,
      reviewName: claimed.external_review_id,
      comment: analysis.response,
    });
    const publishedAt = reply.updateTime || new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("reputation_reviews")
      .update({
        response_status: "PUBLISHED",
        response_published_at: publishedAt,
        remote_reply_time: reply.updateTime || publishedAt,
        last_response_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimed.id)
      .eq("organization_id", claimed.organization_id);
    if (error) throw error;

    return { reviewId: claimed.id, status: "PUBLISHED", published: true };
  } catch (error) {
    await supabaseAdmin
      .from("reputation_reviews")
      .update({
        response_status: "FAILED",
        last_response_error: error?.message || "Google reply failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimed.id)
      .eq("organization_id", claimed.organization_id);
    return {
      reviewId: claimed.id,
      status: "FAILED",
      published: false,
      error: error?.message || "Google reply failed",
    };
  }
}

export async function processPendingReviews({ organizationId, limit = 25 }) {
  const { data, error } = await supabaseAdmin
    .from("reputation_reviews")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("platform", "GOOGLE")
    .not("channel_asset_id", "is", null)
    .in("response_status", ["NEEDS_REVIEW", "FAILED"])
    .lt("response_attempts", 3)
    .order("review_time", { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 25, 1), 100));

  if (error) throw error;

  const results = [];
  for (const review of data || []) {
    try {
      results.push(await processReview(review));
    } catch (processingError) {
      await supabaseAdmin
        .from("reputation_reviews")
        .update({
          response_status: "FAILED",
          processing_started_at: null,
          last_response_error:
            processingError?.message || "Review processing failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", review.id)
        .eq("organization_id", organizationId);
      results.push({
        reviewId: review.id,
        status: "FAILED",
        error: processingError?.message || "Review processing failed",
      });
    }
  }

  return results;
}

async function existingReviewMap(organizationId, externalReviewIds) {
  const map = new Map();

  for (let index = 0; index < externalReviewIds.length; index += 50) {
    const ids = externalReviewIds.slice(index, index + 50);
    if (!ids.length) continue;

    const { data, error } = await supabaseAdmin
      .from("reputation_reviews")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("platform", "GOOGLE")
      .in("external_review_id", ids);
    if (error) throw error;

    for (const review of data || []) map.set(review.external_review_id, review);
  }

  return map;
}

function normalizedReviewName(review, reviewParent) {
  if (String(review.name || "").startsWith("accounts/")) return review.name;
  const id = review.reviewId || review.name;
  return id ? `${reviewParent}/reviews/${id}` : null;
}

function googleDiscoveryRetryAt(connection) {
  const value = connection?.metadata?.location_discovery_retry_at;
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return null;
  return new Date(timestamp).toISOString();
}

function isGoogleQuotaError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    Number(error?.status) === 429 ||
    message.includes("quota exceeded") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted")
  );
}

async function recordGoogleDiscoveryFailure({ connection, error }) {
  const now = new Date().toISOString();
  const quotaLimited = isGoogleQuotaError(error);
  const previousFailures = Math.max(
    Number(connection?.metadata?.location_discovery_failures || 0),
    0
  );
  const failures = previousFailures + 1;
  const baseDelay = quotaLimited
    ? GOOGLE_DISCOVERY_QUOTA_RETRY_MS
    : GOOGLE_DISCOVERY_TRANSIENT_RETRY_MS;
  const delay = Math.min(
    baseDelay * Math.pow(2, Math.min(failures - 1, 4)),
    GOOGLE_DISCOVERY_MAX_RETRY_MS
  );
  const retryAt = new Date(Date.now() + delay).toISOString();
  const metadata = {
    ...(connection.metadata || {}),
    location_discovery_status: quotaLimited ? "RATE_LIMITED" : "PENDING",
    location_discovery_error: String(
      error?.message || "Google Business location discovery failed"
    ).slice(0, 500),
    location_discovery_attempted_at: now,
    location_discovery_retry_at: retryAt,
    location_discovery_failures: failures,
  };

  const { data: updatedConnection, error: updateError } = await supabaseAdmin
    .from("organization_channel_connections")
    .update({
      metadata,
      updated_at: now,
    })
    .eq("id", connection.id)
    .eq("organization_id", connection.organization_id)
    .select("*")
    .single();

  if (updateError) throw updateError;

  return {
    connection: updatedConnection,
    quotaLimited,
    retryAt,
  };
}

export async function syncGoogleReviews({ organizationId, maxReviews = 200 }) {
  const organizationPolicy = await loadPolicy(organizationId);
  if (!organizationPolicy) {
    throw new Error("No active review response policy is configured");
  }
  const historicalBackfill = !organizationPolicy.backfill_started_at;
  const { connection, accessToken } = await getGoogleBusinessAccess({
    organizationId,
  });
  const { data: storedAssets, error: assetError } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("connection_id", connection.id)
    .eq("channel_provider", "google")
    .eq("asset_type", "google_business_location")
    .order("created_at", { ascending: true });

  if (assetError) throw assetError;
  let activeConnection = connection;
  let assets = storedAssets || [];

  if (!assets.length) {
    const retryAt = googleDiscoveryRetryAt(connection);
    if (retryAt) {
      return {
        synced: 0,
        processed: [],
        historicalBackfill,
        backfillRemaining: null,
        skipped: true,
        reason: "GOOGLE_LOCATION_DISCOVERY_COOLDOWN",
        retryAt,
      };
    }

    try {
      const discovery = await discoverAndRegisterGoogleBusinessLocations({
        organizationId,
        connection,
        accessToken,
      });
      activeConnection = discovery.connection;
      assets = discovery.assets || [];
    } catch (error) {
      const failure = await recordGoogleDiscoveryFailure({
        connection,
        error,
      });

      return {
        synced: 0,
        processed: [],
        historicalBackfill,
        backfillRemaining: null,
        skipped: true,
        reason: failure.quotaLimited
          ? "GOOGLE_LOCATION_DISCOVERY_RATE_LIMITED"
          : "GOOGLE_LOCATION_DISCOVERY_PENDING",
        retryAt: failure.retryAt,
        error:
          error?.message || "Google Business location discovery failed",
      };
    }
  }

  if (!assets.length) {
    return {
      synced: 0,
      processed: [],
      historicalBackfill,
      backfillRemaining: null,
      skipped: true,
      reason: "GOOGLE_LOCATION_NOT_FOUND",
      retryAt: null,
    };
  }

  let synced = 0;
  for (const asset of assets) {
    const reviewParent =
      asset.metadata?.review_parent || asset.external_id || null;
    if (!reviewParent) continue;

    const googleReviews = await listGoogleLocationReviews({
      accessToken,
      reviewParent,
      maxReviews: historicalBackfill ? null : maxReviews,
    });
    const namedReviews = googleReviews
      .map((review) => ({
        review,
        reviewName: normalizedReviewName(review, reviewParent),
      }))
      .filter((item) => item.reviewName);
    const existing = await existingReviewMap(
      organizationId,
      namedReviews.map((item) => item.reviewName)
    );
    const now = new Date().toISOString();
    const rows = namedReviews.map(({ review, reviewName }) => {
      const previous = existing.get(reviewName) || {};
      const remoteReply = review.reviewReply || null;

      return {
        organization_id: organizationId,
        entity_id:
          asset.entity_id ||
          asset.metadata?.entity_id ||
          previous.entity_id ||
          null,
        party_id: previous.party_id || null,
        channel_connection_id: activeConnection.id,
        channel_asset_id: asset.id,
        platform: "GOOGLE",
        external_review_id: reviewName,
        author_name: review.reviewer?.displayName || previous.author_name || null,
        rating: numericRating(review.starRating || review.rating),
        review_text: review.comment || null,
        review_time: review.createTime || review.updateTime || null,
        review_url:
          asset.metadata?.maps_uri || asset.metadata?.new_review_uri || null,
        profile_photo_url:
          review.reviewer?.profilePhotoUrl || previous.profile_photo_url || null,
        response_text: remoteReply?.comment || previous.response_text || null,
        response_status: remoteReply
          ? "PUBLISHED"
          : previous.response_status || "NEEDS_REVIEW",
        sentiment: previous.sentiment || null,
        classification: previous.classification || null,
        sentiment_score: previous.sentiment_score || null,
        response_strategy: previous.response_strategy || null,
        language_code: previous.language_code || null,
        response_generated_at: previous.response_generated_at || null,
        response_published_at: remoteReply
          ? remoteReply.updateTime || now
          : previous.response_published_at || null,
        remote_reply_time: remoteReply?.updateTime || previous.remote_reply_time || null,
        response_attempts: Number(previous.response_attempts || 0),
        last_response_error: remoteReply ? null : previous.last_response_error || null,
        processing_started_at: previous.processing_started_at || null,
        metadata: {
          ...(previous.metadata || {}),
          google: {
            review_id: review.reviewId || null,
            review_parent: reviewParent,
            update_time: review.updateTime || null,
            anonymous: review.reviewer?.isAnonymous || false,
          },
        },
        updated_at: now,
      };
    });

    if (rows.length) {
      const { error } = await supabaseAdmin
        .from("reputation_reviews")
        .upsert(rows, {
          onConflict: "organization_id,platform,external_review_id",
        });
      if (error) throw error;
      synced += rows.length;
    }
  }

  const syncTime = new Date().toISOString();
  const { error: syncStateError } = await supabaseAdmin
    .from("reputation_review_policies")
    .update({
      backfill_started_at:
        organizationPolicy.backfill_started_at || syncTime,
      last_synced_at: syncTime,
      updated_at: syncTime,
    })
    .eq("id", organizationPolicy.id)
    .eq("organization_id", organizationId);
  if (syncStateError) throw syncStateError;

  const processed = await processPendingReviews({
    organizationId,
    limit: historicalBackfill ? 100 : 50,
  });
  const [pendingResult, retryResult] = await Promise.all([
    supabaseAdmin
      .from("reputation_reviews")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("platform", "GOOGLE")
      .in("response_status", ["NEEDS_REVIEW", "PROCESSING"]),
    supabaseAdmin
      .from("reputation_reviews")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("platform", "GOOGLE")
      .eq("response_status", "FAILED")
      .lt("response_attempts", 3),
  ]);
  if (pendingResult.error) throw pendingResult.error;
  if (retryResult.error) throw retryResult.error;

  const remaining = Number(pendingResult.count || 0) + Number(retryResult.count || 0);
  if (!remaining && !organizationPolicy.backfill_completed_at) {
    const { error: completionError } = await supabaseAdmin
      .from("reputation_review_policies")
      .update({
        backfill_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", organizationPolicy.id)
      .eq("organization_id", organizationId);
    if (completionError) throw completionError;
  }

  return {
    synced,
    processed,
    historicalBackfill,
    backfillRemaining: remaining,
  };
}

export async function publishApprovedReview({
  organizationId,
  reviewId,
  responseText = null,
}) {
  const { data: review, error } = await supabaseAdmin
    .from("reputation_reviews")
    .select("*")
    .eq("id", reviewId)
    .eq("organization_id", organizationId)
    .eq("platform", "GOOGLE")
    .maybeSingle();
  if (error) throw error;
  if (!review) throw new Error("Review not found");
  if (!String(review.external_review_id || "").startsWith("accounts/")) {
    throw new Error("Review is not linked to a Google Business Profile location");
  }
  if (!["PENDING_APPROVAL", "ESCALATED", "FAILED"].includes(review.response_status)) {
    throw new Error("Review is not awaiting approval");
  }

  const comment = String(responseText || review.response_text || "").trim();
  if (!comment) throw new Error("A response is required");
  const policy = await loadPolicy(organizationId, review.channel_asset_id);
  const maxReplyLength = Number(policy?.max_reply_length || 900);
  if (comment.length > maxReplyLength) {
    throw new Error(`Response cannot exceed ${maxReplyLength} characters`);
  }

  const { error: publishingError } = await supabaseAdmin
    .from("reputation_reviews")
    .update({
      response_text: comment,
      response_status: "PUBLISHING",
      last_response_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", review.id)
    .eq("organization_id", organizationId);
  if (publishingError) throw publishingError;

  try {
    const reply = await publishGoogleReviewReply({
      organizationId,
      reviewName: review.external_review_id,
      comment,
    });
    const publishedAt = reply.updateTime || new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("reputation_reviews")
      .update({
        response_text: reply.comment || comment,
        response_status: "PUBLISHED",
        response_published_at: publishedAt,
        remote_reply_time: reply.updateTime || publishedAt,
        last_response_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", review.id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return updated;
  } catch (publishError) {
    await supabaseAdmin
      .from("reputation_reviews")
      .update({
        response_status: review.response_status,
        last_response_error: publishError?.message || "Google reply failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", review.id)
      .eq("organization_id", organizationId);
    throw publishError;
  }
}
