export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const QUOTE_TERMINAL = new Set([
  "cancelled",
  "closed",
  "converted",
  "expired",
  "rejected",
]);
const ORDER_TERMINAL = new Set([
  "cancelled",
  "closed",
  "complete",
  "completed",
  "fulfilled",
  "void",
]);
const RESPONSE_COMPLETE = new Set([
  "complete",
  "completed",
  "published",
  "responded",
  "replied",
  "sent",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function titleCase(value) {
  return clean(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function entityScoped(query, entityId, column = "entity_id") {
  if (!entityId) return query;
  return query.or(`${column}.eq.${entityId},${column}.is.null`);
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function daysFromToday(value, today) {
  const date = dateOnly(value);
  if (!date) return null;
  const difference = new Date(`${date}T00:00:00.000Z`).getTime() -
    new Date(`${today}T00:00:00.000Z`).getTime();
  return Math.round(difference / 86400000);
}

function commercialHref(path) {
  const cleanPath = clean(path).replace(/^\/+/, "");
  return `/commercial/${cleanPath}`;
}

async function safe(source, task, fallback) {
  try {
    return {
      source,
      status: "connected",
      data: await task(),
      error: null,
    };
  } catch (error) {
    console.error("COMMERCIAL_COMMAND_CENTER_SOURCE_FAILED", {
      source,
      error,
    });
    return {
      source,
      status: "error",
      data: fallback,
      error: error?.message || "Source unavailable",
    };
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") ||
        url.searchParams.get("organization_id"),
    );
    const entityId = clean(
      url.searchParams.get("entityId") || url.searchParams.get("entity_id"),
    );
    const periodId = clean(
      url.searchParams.get("periodId") || url.searchParams.get("period_id"),
    );

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });

    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 400 },
      );
    }

    const resolvedEntityId = context.entityId || null;
    const today = new Date().toISOString().slice(0, 10);

    const [
      customersSource,
      quotationsSource,
      ordersSource,
      conversationsSource,
      reviewsSource,
      campaignsSource,
      campaignQueueSource,
      invoicesSource,
    ] = await Promise.all([
      safe("customer_profiles", async () => {
        const { data, error } = await supabaseAdmin
          .from("customer_profiles")
          .select("party_id, customer_number, customer_type, status, marketing_opt_in, updated_at")
          .eq("organization_id", context.organizationId)
          .limit(10000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("commercial_quotations", async () => {
        let query = supabaseAdmin
          .from("commercial_quotations")
          .select("id, entity_id, quotation_number, party_id, customer_name, status, currency_code, total_amount, valid_until, sales_order_id, sent_at, accepted_at, created_at, updated_at")
          .eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query
          .order("updated_at", { ascending: false })
          .limit(5000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("sales_orders", async () => {
        let query = supabaseAdmin
          .from("sales_orders")
          .select("id, entity_id, order_number, party_id, customer_id, customer_name, status, payment_status, fulfillment_status, currency_code, total_amount, paid_amount, remaining_balance, confirmed_at, created_at, updated_at")
          .eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query
          .order("updated_at", { ascending: false })
          .limit(5000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("communication_conversations", async () => {
        const { data, error } = await supabaseAdmin
          .from("communication_conversations")
          .select("id, customer_party_id, external_participant_name, channel_type, subject, status, unread_count, last_message_at, last_inbound_at, last_outbound_at")
          .eq("organization_id", context.organizationId)
          .order("last_message_at", { ascending: false })
          .limit(2500);
        if (error) throw error;
        return data || [];
      }, []),
      safe("reputation_reviews", async () => {
        let query = supabaseAdmin
          .from("reputation_reviews")
          .select("id, entity_id, platform, author_name, rating, review_text, review_time, response_status, response_published_at, sentiment, classification, created_at")
          .eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query
          .order("review_time", { ascending: false })
          .limit(2500);
        if (error) throw error;
        return data || [];
      }, []),
      safe("marketing_campaigns", async () => {
        const { data, error } = await supabaseAdmin
          .from("marketing_campaigns")
          .select("id, campaign_name, campaign_type, campaign_status, scheduled_at, launched_at, completed_at, budget, expected_revenue, actual_revenue, created_at")
          .eq("organization_id", context.organizationId)
          .order("created_at", { ascending: false })
          .limit(2500);
        if (error) throw error;
        return data || [];
      }, []),
      safe("marketing_campaign_queue", async () => {
        const { data, error } = await supabaseAdmin
          .from("marketing_campaign_queue")
          .select("id, campaign_id, platform, status, retry_count, last_error, scheduled_for, created_at")
          .eq("organization_id", context.organizationId)
          .order("created_at", { ascending: false })
          .limit(2500);
        if (error) throw error;
        return data || [];
      }, []),
      safe("customer_invoices", async () => {
        let query = supabaseAdmin
          .from("customer_invoices")
          .select("id, entity_id, invoice_number, party_id, currency_code, outstanding_amount, outstanding_balance, due_date, status, posted_at, sent_at, created_at")
          .eq("organization_id", context.organizationId);
        query = entityScoped(query, resolvedEntityId);
        const { data, error } = await query
          .order("due_date", { ascending: true })
          .limit(5000);
        if (error) throw error;
        return data || [];
      }, []),
    ]);

    const customers = customersSource.data || [];
    const quotations = quotationsSource.data || [];
    const orders = ordersSource.data || [];
    const conversations = conversationsSource.data || [];
    const reviews = reviewsSource.data || [];
    const campaigns = campaignsSource.data || [];
    const campaignQueue = campaignQueueSource.data || [];
    const invoices = invoicesSource.data || [];

    const activeCustomers = customers.filter((row) =>
      !["archived", "blocked", "inactive"].includes(normalized(row.status)),
    );
    const openQuotes = quotations.filter((row) => !QUOTE_TERMINAL.has(normalized(row.status)));
    const sentQuotes = openQuotes.filter((row) => normalized(row.status) === "sent");
    const acceptedQuotes = openQuotes.filter((row) =>
      normalized(row.status) === "accepted" && !row.sales_order_id,
    );
    const expiredSentQuotes = sentQuotes.filter((row) => {
      const days = daysFromToday(row.valid_until, today);
      return days !== null && days < 0;
    });
    const expiringQuotes = sentQuotes.filter((row) => {
      const days = daysFromToday(row.valid_until, today);
      return days !== null && days >= 0 && days <= 7;
    });

    const openOrders = orders.filter((row) => !ORDER_TERMINAL.has(normalized(row.status)));
    const draftOrders = openOrders.filter((row) => normalized(row.status) === "draft");
    const fulfillmentPending = openOrders.filter((row) =>
      !["fulfilled", "complete", "completed", "cancelled"].includes(
        normalized(row.fulfillment_status),
      ),
    );
    const paymentOpen = openOrders.filter((row) =>
      numeric(row.remaining_balance) > 0 &&
      !["paid", "refunded", "void"].includes(normalized(row.payment_status)),
    );

    const unreadConversations = conversations.filter((row) => numeric(row.unread_count) > 0);
    const pendingReviews = reviews.filter((row) =>
      !row.response_published_at && !RESPONSE_COMPLETE.has(normalized(row.response_status)),
    );
    const lowReviews = pendingReviews.filter((row) => numeric(row.rating) > 0 && numeric(row.rating) <= 3);
    const activeCampaigns = campaigns.filter((row) =>
      ["active", "launched", "live", "queued", "ready", "scheduled"].includes(
        normalized(row.campaign_status),
      ),
    );
    const failedCampaignQueue = campaignQueue.filter((row) =>
      ["failed", "error"].includes(normalized(row.status)) || Boolean(row.last_error),
    );

    const outstandingInvoices = invoices.filter((row) => {
      const outstanding = Math.max(
        numeric(row.outstanding_amount),
        numeric(row.outstanding_balance),
      );
      return outstanding > 0 && !["cancelled", "credited", "paid", "void"].includes(normalized(row.status));
    });
    const overdueInvoices = outstandingInvoices.filter((row) => {
      const due = dateOnly(row.due_date);
      return due && due < today;
    });

    const quoteValue = openQuotes.reduce((sum, row) => sum + numeric(row.total_amount), 0);
    const orderValue = openOrders.reduce((sum, row) => sum + numeric(row.total_amount), 0);
    const openBalance = outstandingInvoices.reduce(
      (sum, row) => sum + Math.max(numeric(row.outstanding_amount), numeric(row.outstanding_balance)),
      0,
    );

    const queue = [];

    acceptedQuotes.slice(0, 5).forEach((row) => {
      queue.push({
        id: `quote-accepted:${row.id}`,
        kind: "quotation",
        priority: "attention",
        title: row.quotation_number || "Accepted quotation",
        detail: `${row.customer_name || "Customer"} · Accepted and ready to convert`,
        status: "Convert to order",
        href: commercialHref("sales/quotes"),
      });
    });

    expiredSentQuotes.slice(0, 5).forEach((row) => {
      queue.push({
        id: `quote-expired:${row.id}`,
        kind: "quotation",
        priority: "attention",
        title: row.quotation_number || "Quotation",
        detail: `${row.customer_name || "Customer"} · Validity ended ${row.valid_until}`,
        status: "Follow up",
        href: commercialHref("sales/quotes"),
      });
    });

    expiringQuotes.slice(0, 5).forEach((row) => {
      queue.push({
        id: `quote-expiring:${row.id}`,
        kind: "quotation",
        priority: "review",
        title: row.quotation_number || "Quotation",
        detail: `${row.customer_name || "Customer"} · Valid until ${row.valid_until}`,
        status: "Expiring soon",
        href: commercialHref("sales/quotes"),
      });
    });

    draftOrders.slice(0, 4).forEach((row) => {
      queue.push({
        id: `order-draft:${row.id}`,
        kind: "sales_order",
        priority: "review",
        title: row.order_number || "Draft sales order",
        detail: `${row.customer_name || "Customer"} · Needs confirmation`,
        status: "Draft",
        href: commercialHref("sales/orders"),
      });
    });

    fulfillmentPending
      .filter((row) => normalized(row.status) !== "draft")
      .slice(0, 5)
      .forEach((row) => {
        queue.push({
          id: `order-fulfillment:${row.id}`,
          kind: "fulfillment",
          priority: "review",
          title: row.order_number || "Sales order",
          detail: `${row.customer_name || "Customer"} · ${titleCase(row.fulfillment_status || "Fulfillment pending")}`,
          status: row.fulfillment_status || "Pending",
          href: commercialHref("sales/orders"),
        });
      });

    unreadConversations.slice(0, 5).forEach((row) => {
      queue.push({
        id: `conversation:${row.id}`,
        kind: "communication",
        priority: "attention",
        title: row.external_participant_name || row.subject || "Customer conversation",
        detail: `${numeric(row.unread_count)} unread · ${titleCase(row.channel_type || "Channel")}`,
        status: "Reply",
        href: commercialHref("customers/communications"),
      });
    });

    lowReviews.slice(0, 4).forEach((row) => {
      queue.push({
        id: `review-low:${row.id}`,
        kind: "review",
        priority: "attention",
        title: `${numeric(row.rating)}★ review from ${row.author_name || "Customer"}`,
        detail: `${titleCase(row.platform || "Review")} · Response required`,
        status: "Review response",
        href: commercialHref("reviews"),
      });
    });

    pendingReviews
      .filter((row) => !lowReviews.some((candidate) => candidate.id === row.id))
      .slice(0, 3)
      .forEach((row) => {
        queue.push({
          id: `review:${row.id}`,
          kind: "review",
          priority: "review",
          title: `${numeric(row.rating) || "New"}★ review from ${row.author_name || "Customer"}`,
          detail: `${titleCase(row.platform || "Review")} · Awaiting response`,
          status: "Respond",
          href: commercialHref("reviews"),
        });
      });

    failedCampaignQueue.slice(0, 4).forEach((row) => {
      queue.push({
        id: `campaign:${row.id}`,
        kind: "marketing",
        priority: "attention",
        title: `${titleCase(row.platform || "Campaign")} publishing issue`,
        detail: row.last_error || "Campaign delivery failed",
        status: row.status || "Failed",
        href: commercialHref("marketing/queue"),
      });
    });

    const sources = Object.fromEntries(
      [
        customersSource,
        quotationsSource,
        ordersSource,
        conversationsSource,
        reviewsSource,
        campaignsSource,
        campaignQueueSource,
        invoicesSource,
      ].map((source) => [source.source, { status: source.status, error: source.error }]),
    );

    return NextResponse.json({
      success: true,
      ready: true,
      context: {
        organization_id: context.organizationId,
        entity_id: resolvedEntityId,
        period_id: context.periodId || null,
        currency: context.currency || null,
      },
      metrics: {
        customers: {
          active: activeCustomers.length,
          unread_conversations: unreadConversations.reduce(
            (sum, row) => sum + numeric(row.unread_count),
            0,
          ),
          source_status:
            customersSource.status === "error" || conversationsSource.status === "error"
              ? "error"
              : "connected",
        },
        quotations: {
          open: openQuotes.length,
          value: quoteValue,
          sent: sentQuotes.length,
          accepted_to_convert: acceptedQuotes.length,
          expiring: expiringQuotes.length,
          expired_sent: expiredSentQuotes.length,
          source_status: quotationsSource.status,
        },
        orders: {
          open: openOrders.length,
          value: orderValue,
          draft: draftOrders.length,
          fulfillment_pending: fulfillmentPending.length,
          payment_open: paymentOpen.length,
          source_status: ordersSource.status,
        },
        reputation: {
          pending_responses: pendingReviews.length,
          low_rating_pending: lowReviews.length,
          source_status: reviewsSource.status,
        },
        marketing: {
          active: activeCampaigns.length,
          publishing_errors: failedCampaignQueue.length,
          source_status:
            campaignsSource.status === "error" || campaignQueueSource.status === "error"
              ? "error"
              : "connected",
        },
        revenue_handoff: {
          outstanding_invoices: outstandingInvoices.length,
          overdue_invoices: overdueInvoices.length,
          outstanding_amount: openBalance,
          source_status: invoicesSource.status,
        },
      },
      flow: [
        {
          id: "customer",
          label: "Customer & conversation",
          count: unreadConversations.reduce((sum, row) => sum + numeric(row.unread_count), 0),
          detail: `${activeCustomers.length} active customers`,
          href: commercialHref("customers"),
        },
        {
          id: "quote",
          label: "Quote",
          count: openQuotes.length,
          detail: `${acceptedQuotes.length} ready to convert · ${expiringQuotes.length} expiring`,
          href: commercialHref("sales/quotes"),
        },
        {
          id: "order",
          label: "Order",
          count: openOrders.length,
          detail: `${draftOrders.length} draft · ${fulfillmentPending.length} fulfillment pending`,
          href: commercialHref("sales/orders"),
        },
        {
          id: "fulfill",
          label: "Fulfillment",
          count: fulfillmentPending.length,
          detail: "Commercial commitment into operational execution",
          href: commercialHref("sales/orders"),
        },
        {
          id: "revenue",
          label: "Invoice & collect",
          count: outstandingInvoices.length,
          detail: `${overdueInvoices.length} overdue finance handoffs`,
          href: "/finance/customer-invoices",
        },
      ],
      queue: queue.slice(0, 18),
      sources,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("COMMERCIAL_COMMAND_CENTER_FAILED", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load Commercial command center",
      },
      { status: 500 },
    );
  }
}
