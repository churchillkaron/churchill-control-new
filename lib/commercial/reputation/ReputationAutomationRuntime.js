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

function reviewerFirstName(value) {
  const name = String(value || "").trim();
  if (!name) return "Guest";
  return name.split(/\s+/)[0].slice(0, 40);
}

function stableVariant(review, count) {
  const source = String(
    review?.external_review_id || review?.id || review?.author_name || "review",
  );
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return count > 0 ? hash % count : 0;
}

function duplicateRepairAttempts(review) {
  const value = Number(
    review?.metadata?.response_generation?.duplicate_repair_attempts || 0,
  );
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeReply(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function replySimilarity(a, b) {
  const left = new Set(normalizeReply(a).split(" ").filter(Boolean));
  const right = new Set(normalizeReply(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

async function recentPublishedReplies(organizationId, limit = 500) {
  const { data, error } = await supabaseAdmin
    .from("reputation_reviews")
    .select("response_text")
    .eq("organization_id", organizationId)
    .eq("platform", "GOOGLE")
    .eq("response_status", "PUBLISHED")
    .not("response_text", "is", null)
    .order("response_published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row) => String(row.response_text || "").trim()).filter(Boolean);
}

function fallbackAnalysis(review, policy) {
  const rating = numericRating(review.rating);
  const brand = policy.brand_name || "our restaurant";
  const firstName = reviewerFirstName(review.author_name);
  const hasText = Boolean(String(review.review_text || "").trim());

  if (rating >= 4) {
    const noTextReplies = [
      `Thank you, ${firstName}, for the ${rating}-star rating. We truly appreciate your visit to ${brand} and hope to see you again.`,
      `${firstName}, thank you for rating ${brand} ${rating} stars. Your support means a lot to us, and we hope to welcome you back.`,
      `We really appreciate the ${rating}-star rating, ${firstName}. Thank you for choosing ${brand}.`,
      `Many thanks for your ${rating}-star rating, ${firstName}. We’re grateful you took a moment to support ${brand}.`,
      `Thank you for the ${rating} stars, ${firstName}. It’s wonderful to have your support for ${brand}, and we hope to welcome you again.`,
    ];
    return {
      response: hasText
        ? `Thank you, ${firstName}, for sharing your experience with us at ${brand}. We really appreciate you taking the time to leave these comments and hope to welcome you back again soon.`
        : noTextReplies[stableVariant(review, noTextReplies.length)],
      language_code: "en",
      sentiment: "POSITIVE",
      sentiment_score: rating >= 5 ? 0.95 : 0.7,
      classification: "PRAISE",
      response_strategy: "THANK_AND_INVITE_BACK",
      ai_generated: false,
    };
  }

  if (rating >= 3) {
    const noTextReplies = [
      `Thank you for the ${rating}-star rating, ${firstName}. We appreciate you taking a moment to rate ${brand}.`,
      `${firstName}, thank you for your ${rating}-star rating of ${brand}. We value your feedback and appreciate your visit.`,
      `We appreciate the ${rating} stars, ${firstName}. Thank you for choosing ${brand} and sharing your rating with us.`,
    ];
    return {
      response: hasText
        ? `Thank you, ${firstName}, for taking the time to share your ${rating}-star feedback with ${brand}. We appreciate it and will use it to keep improving the guest experience.`
        : noTextReplies[stableVariant(review, noTextReplies.length)],
      language_code: "en",
      sentiment: "MIXED",
      sentiment_score: 0,
      classification: "MIXED_EXPERIENCE",
      response_strategy: "ACKNOWLEDGE_AND_IMPROVE",
      ai_generated: false,
    };
  }

  const noTextReplies = [
    `${firstName}, thank you for leaving your ${rating}-star rating. We’re sorry ${brand} did not meet expectations and would value the opportunity to understand what could have been better.`,
    `Thank you for your ${rating}-star rating, ${firstName}. We’re disappointed that your visit to ${brand} fell short and would appreciate hearing more about your experience.`,
    `We appreciate you rating us, ${firstName}. A ${rating}-star experience is not what we aim for at ${brand}, and we would welcome any details you would like to share.`,
  ];
  return {
    response: hasText
      ? `Thank you, ${firstName}, for telling us about your experience at ${brand}. We’re sorry it did not meet expectations, and we would appreciate the chance to understand the concerns you raised and follow up properly.`
      : noTextReplies[stableVariant(review, noTextReplies.length)],
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

function generatedText(execution) {
  const output = execution?.output || {};
  const raw = output?.raw || {};
  const nestedOutput = raw?.output || {};
  return String(
    output?.text ||
    output?.output?.text ||
    output?.result?.text ||
    raw?.text ||
    nestedOutput?.text ||
    raw?.result?.text ||
    ""
  ).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function settleReviewIntelligenceExecution(execution, review) {
  if (execution?.pending !== true) return execution;

  const provider = String(execution?.provider || "").trim();
  const providerJobId = String(execution?.provider_job_id || "").trim();
  const usageId = String(execution?.usage?.id || "").trim();
  if (!provider || !providerJobId || !usageId) {
    throw new Error("REVIEW_INTELLIGENCE_PENDING_BINDING_REQUIRED");
  }

  for (let poll = 1; poll <= 150; poll += 1) {
    const settled = await ServiceExecutionRuntime.settle({
      organization_id: review.organization_id,
      provider,
      provider_job_id: providerJobId,
      usage_id: usageId,
      pricing: execution?.pricing || {},
      quantity: execution?.usage?.quantity ?? 1,
      unit: execution?.usage?.unit || execution?.pricing?.unit || "request",
      metadata: {
        module: "COMMERCIAL_REPUTATION",
        operation: "GENERATE_REVIEW_RESPONSE",
        review_id: review.id,
        review_intelligence_settlement_poll: poll,
      },
      provider_status_input: {
        capability: "ai.text.generate",
        execution_lane: "fast",
        model: "Qwen/Qwen3-4B-GGUF:Q4_K_M",
        infrastructure_policy: "local_only",
        local_compute_required: true,
      },
      credential_id: execution?.credential_id || null,
      started_at: execution?.started_at || null,
    });

    if (settled?.pending === true) {
      await sleep(1000);
      continue;
    }
    if (settled?.failed === true || settled?.success !== true) {
      throw new Error(
        settled?.error || "REVIEW_INTELLIGENCE_PENDING_SETTLEMENT_FAILED"
      );
    }
    return {
      ...execution,
      ...settled,
      output: settled?.output,
      pending: false,
    };
  }

  throw new Error("REVIEW_INTELLIGENCE_PENDING_SETTLEMENT_TIMEOUT");
}

async function generateResponseAnalysis(review, policy) {
  const fallback = fallbackAnalysis(review, policy);
  const hasWrittenReview = Boolean(String(review.review_text || "").trim());
  if (!hasWrittenReview) {
    return {
      ...fallback,
      ai_error: null,
      deterministic_personalized: true,
    };
  }

  const recentReplies = await recentPublishedReplies(review.organization_id);
  const avoidExamples = recentReplies.slice(0, 12).join("\n---\n");

  try {
    const execution = await ServiceExecutionRuntime.execute({
      organization_id: review.organization_id,
      party_id: review.party_id || null,
      entity_id: review.entity_id || policy.entity_id || null,
      service_id: "ai.text.generate",
      input: {
        execution_lane: "fast",
        model: "Qwen/Qwen3-4B-GGUF:Q4_K_M",
        infrastructure_policy: "local_only",
        local_compute_required: true,
        max_output_tokens: 500,
        prompt: `You write public Google review replies for a restaurant.

Restaurant: ${policy.brand_name}
Brand voice: ${policy.brand_voice}
Default language when there is no written comment: ${policy.default_language || "en"}
Rating: ${numericRating(review.rating)} out of 5
Reviewer: ${review.author_name || "Guest"}
Review: ${review.review_text || "The guest left a rating without written comments."}

Rules:
- Reply in the language the reviewer actually wrote. If Google shows both "(Translated by Google)" and "(Original)", the text under "(Original)" is authoritative: answer in that original language.
- Preserve the reviewer's displayed name exactly as provided. Do not translate, romanize, respell or guess a different form of their name.
- Treat this as a one-to-one response to this exact guest, never as a reusable template.
- When the review contains written detail, explicitly acknowledge one or two concrete details from it in natural language.
- Vary the opening, sentence rhythm and closing. Do not reuse stock phrases from recent replies.
- If there is no written comment, personalize with the reviewer's displayed name and rating without inventing an experience.
- Be warm, sincere, specific only when the review provides the detail, and concise.
- Use only details actually stated in the review. Do not embellish adjectives, infer when the visit happened, or say "tonight", "today", "this evening", or similar unless the reviewer said it.
- Do not invent facts, discounts, remedies, contact details, staff actions, future operational actions, or promises such as "we'll pass this to the team" unless they are actually supported by the supplied context.
- Do not admit legal liability or disclose private information.
- Do not overuse the reviewer's name.
- For a negative review, acknowledge the concern and invite direct management follow-up without promising compensation.
- The public reply must be no longer than ${policy.max_reply_length || 900} characters.
- Avoid sounding like any of these recent replies:\n${avoidExamples || "No recent replies available."}
- Return only valid JSON with this shape:
{"response":"","language_code":"","sentiment":"POSITIVE|MIXED|NEGATIVE","sentiment_score":0,"classification":"PRAISE|MIXED_EXPERIENCE|SERVICE_RECOVERY|GENERAL","response_strategy":""}`,
      },
      provider_policy: {
        allowed_providers: ["avantiqo-intelligence"],
        allow_owned_reasoning_fallback: false,
      },
      metadata: {
        module: "COMMERCIAL_REPUTATION",
        operation: "GENERATE_REVIEW_RESPONSE",
        review_id: review.id,
        compute_target: "AVANTIQO_LOCAL_NODE_V1",
        modal_fallback_forbidden: true,
      },
      category: "AI",
    });

    const settledExecution = await settleReviewIntelligenceExecution(
      execution,
      review,
    );
    const raw = generatedText(settledExecution);
    const parsed = parseJsonObject(raw);
    const response = String(parsed.response || "").trim();
    if (!response) throw new Error("AI response was empty");
    const tooSimilar = recentReplies.some(
      (previous) =>
        normalizeReply(previous) === normalizeReply(response) ||
        replySimilarity(previous, response) >= 0.78
    );
    if (tooSimilar) throw new Error("REVIEW_REPLY_TOO_SIMILAR_TO_RECENT_REPLY");

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

function isTransientReviewInfrastructureError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);
  if (status === 429 || status >= 500) return true;
  return [
    "pgrst002",
    "pgrst003",
    "pgrst203",
    "schema cache",
    "connection terminated",
    "connection timed out",
    "fetch failed",
    "web server is down",
    "statement timeout",
    "model_policy_rejected",
    "no priced executable provider",
    "review_intelligence_pending_settlement_timeout",
    "avantiqo_rpc_retry_exhausted",
    "local_compute",
    "temporarily unavailable",
  ].some((signal) => message.includes(signal));
}

async function deferInfrastructureRetry(review, error) {
  const attempts = review.response_status === "PROCESSING"
    ? Math.max(Number(review.response_attempts || 0) - 1, 0)
    : Math.max(Number(review.response_attempts || 0), 0);
  const message = String(error?.message || error || "Transient review infrastructure failure").slice(0, 1000);
  const { error: updateError } = await supabaseAdmin
    .from("reputation_reviews")
    .update({
      response_status: "NEEDS_REVIEW",
      response_attempts: attempts,
      processing_started_at: null,
      last_response_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", review.id)
    .eq("organization_id", review.organization_id);
  if (updateError) throw updateError;
  return {
    reviewId: review.id,
    status: "NEEDS_REVIEW",
    published: false,
    deferred: true,
    error: message,
  };
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
  const hasWrittenReview = Boolean(String(claimed.review_text || "").trim());
  if (hasWrittenReview && !analysis.ai_generated) {
    const generationError =
      analysis.ai_error || "Personalized review response generation failed";
    if (isTransientReviewInfrastructureError(generationError)) {
      return deferInfrastructureRetry(claimed, generationError);
    }
    await supabaseAdmin
      .from("reputation_reviews")
      .update({
        response_status: "FAILED",
        processing_started_at: null,
        last_response_error: generationError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimed.id)
      .eq("organization_id", claimed.organization_id);
    return {
      reviewId: claimed.id,
      status: "FAILED",
      published: false,
      error: generationError,
    };
  }

  const rating = numericRating(claimed.rating);
  const now = new Date().toISOString();
  const critical = rating <= Number(policy.critical_max_rating || 2);
  const autoPublish =
    !critical && rating >= Number(policy.auto_publish_min_rating || 5);
  const nextStatus = autoPublish ? "PUBLISHING" : "PENDING_APPROVAL";

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

  if (critical) await createRecoveryCase(claimed, analysis);

  if (!autoPublish) {
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
    if (isTransientReviewInfrastructureError(error)) {
      return deferInfrastructureRetry(claimed, error);
    }
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

export async function repairPublishedDuplicateReplies({
  organizationId,
  limit = 20,
}) {
  const cappedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const { data, error } = await supabaseAdmin
    .from("reputation_reviews")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("platform", "GOOGLE")
    .eq("response_status", "PUBLISHED")
    .not("channel_asset_id", "is", null)
    .not("response_text", "is", null)
    .order("review_time", { ascending: false })
    .limit(1000);

  if (error) throw error;

  const rows = data || [];
  const counts = new Map();
  for (const row of rows) {
    const key = normalizeReply(row.response_text);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const candidates = rows
    .filter((row) => (counts.get(normalizeReply(row.response_text)) || 0) > 1)
    .slice(0, cappedLimit);

  const results = [];
  let cursor = 0;
  const workerCount = Math.min(5, candidates.length);

  async function repairNext() {
    while (cursor < candidates.length) {
      const review = candidates[cursor];
      cursor += 1;

      const policy = await loadPolicy(review.organization_id, review.channel_asset_id);
      if (!policy) {
        results.push({ reviewId: review.id, success: false, error: "NO_POLICY" });
        continue;
      }

      const analysis = await generateResponseAnalysis(review, policy);
      const hasWrittenReview = Boolean(String(review.review_text || "").trim());
      if (hasWrittenReview && !analysis.ai_generated) {
        results.push({
          reviewId: review.id,
          success: false,
          error: analysis.ai_error || "PERSONALIZED_RESPONSE_GENERATION_FAILED",
        });
        continue;
      }

      try {
        const reply = await publishGoogleReviewReply({
          organizationId: review.organization_id,
          reviewName: review.external_review_id,
          comment: analysis.response,
        });
        const publishedAt = reply.updateTime || new Date().toISOString();
        const { error: updateError } = await supabaseAdmin
          .from("reputation_reviews")
          .update({
            response_text: analysis.response,
            response_status: "PUBLISHED",
            language_code: analysis.language_code,
            sentiment: analysis.sentiment,
            sentiment_score: analysis.sentiment_score,
            classification: analysis.classification,
            response_strategy: analysis.response_strategy,
            response_generated_at: new Date().toISOString(),
            response_published_at: publishedAt,
            remote_reply_time: reply.updateTime || publishedAt,
            last_response_error: null,
            metadata: {
              ...(review.metadata || {}),
              response_generation: {
                ai_generated: analysis.ai_generated,
                ai_error: analysis.ai_error || null,
                duplicate_repair: true,
              },
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", review.id)
          .eq("organization_id", review.organization_id);
        if (updateError) throw updateError;
        results.push({ reviewId: review.id, success: true, response: analysis.response });
      } catch (repairError) {
        results.push({
          reviewId: review.id,
          success: false,
          error: repairError?.message || "DUPLICATE_REPAIR_FAILED",
        });
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => repairNext()));

  return {
    candidates: candidates.length,
    repaired: results.filter((row) => row.success).length,
    failed: results.filter((row) => !row.success).length,
    results,
  };
}

export async function processPendingReviews({ organizationId, limit = 25 }) {
  const cappedLimit = Math.min(Math.max(Number(limit) || 25, 1), 500);
  const { data, error } = await supabaseAdmin
    .from("reputation_reviews")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("platform", "GOOGLE")
    .not("channel_asset_id", "is", null)
    .in("response_status", ["NEEDS_REVIEW", "FAILED"])
    .lt("response_attempts", 3)
    .order("review_time", { ascending: false })
    .limit(cappedLimit);

  if (error) throw error;

  const reviews = data || [];
  const results = [];
  let cursor = 0;
  const workerCount = Math.min(8, reviews.length);

  async function processNext() {
    while (cursor < reviews.length) {
      const review = reviews[cursor];
      cursor += 1;
      try {
        results.push(await processReview(review));
      } catch (processingError) {
        if (isTransientReviewInfrastructureError(processingError)) {
          results.push(await deferInfrastructureRetry(review, processingError));
          continue;
        }
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
  }

  await Promise.all(Array.from({ length: workerCount }, () => processNext()));
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
    .not("entity_id", "is", null)
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
      assets = (discovery.assets || []).filter(
        (asset) => asset.entity_id || asset.metadata?.entity_id,
      );
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
      reason: "GOOGLE_LOCATION_MAPPING_REQUIRED",
      retryAt: null,
      error: "Map at least one Google Business Profile location to a legal entity before review synchronization.",
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
    limit: historicalBackfill ? 500 : 100,
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
