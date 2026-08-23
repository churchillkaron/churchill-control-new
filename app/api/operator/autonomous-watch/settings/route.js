export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { loadIntelligenceConversationSnapshot } from "@/lib/operator/runtime/IntelligenceConversationRuntime";
import { mutateOperatorWatchProjectState } from "@/lib/operator/runtime/OperatorWatchStateRepository";
import {
  cognitionBudgetSummary,
  evaluateAutonomousCognitionBudget,
  normalizeAutonomousCognitionBudget,
} from "@/lib/operator/runtime/OperatorAutonomousCognitionPolicy";
import { mergeOperatorProjectState } from "@/lib/operator/contracts/OperatorProjectState";
import { operatorPredictionAccountabilitySummary } from "@/lib/operator/contracts/OperatorPredictionAccountability";
import {
  normalizeOperatorProactiveDeliveryPolicy,
  normalizeOperatorProactiveDeliveryPolicySource,
  operatorProactiveDeliveryChannelCatalog,
  operatorProactiveDeliveryPublicPolicy,
} from "@/lib/operator/contracts/OperatorProactiveDeliveryPolicy";
import { operatorProactiveDeliveryStatus } from "@/lib/operator/runtime/OperatorProactiveDeliveryRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";

const FULL_ACCESS_ROLES = new Set(["OWNER", "ORGANIZATION_OWNER", "ORG_OWNER", "PLATFORM_OWNER", "SUPER_ADMIN"]);

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}
function normalizedRole(value) {
  return text(value, 120).toUpperCase();
}
function finiteOrNull(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error(`${field} must be a non-negative number or null`);
  return numeric;
}
function positiveIntegerOrNull(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) throw new Error(`${field} must be a positive integer or null`);
  return numeric;
}
function currencyOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = text(value, 12).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("currency must be a 3-letter ISO currency code or null");
  return normalized;
}
function errorResponse(error, status = 500) {
  return Response.json({ success: false, error }, { status });
}

async function resolveConversation(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { error: errorResponse(access.error, access.status || 403) };
  const partyId = text(access.staff?.party_id || access.staff?.partyId, 120);
  if (!partyId) {
    return { error: errorResponse("Authenticated staff account is not linked to a party", 409) };
  }
  const snapshot = await loadIntelligenceConversationSnapshot({
    organizationId: access.organizationId,
    partyId,
    conversationKey: "primary",
  });
  return { access, partyId, snapshot };
}

function settingsFromProjectState(projectState, { revealDestinations = false } = {}) {
  const watch = object(projectState?.business_watch);
  return {
    enabled: watch.enabled !== false,
    cognition_budget: normalizeAutonomousCognitionBudget(projectState),
    delivery_policy: operatorProactiveDeliveryPublicPolicy(projectState, { revealDestinations }),
    last_cognition: object(watch.last_cognition),
    last_checked_at: text(watch.last_checked_at, 80) || null,
    next_check_at: text(watch.next_check_at, 80) || null,
    last_thesis_level: text(watch.last_thesis_level, 40) || null,
  };
}

function requestedBudget(body, currentBudget) {
  const source = object(body?.cognition_budget || body?.cognitionBudget);
  return {
    enabled: hasOwn(source, "enabled") ? source.enabled !== false : currentBudget.enabled !== false,
    customer_spend_limit:
      hasOwn(source, "customer_spend_limit") || hasOwn(source, "rolling_24h_customer_spend_limit")
        ? finiteOrNull(source.customer_spend_limit ?? source.rolling_24h_customer_spend_limit, "customer_spend_limit")
        : currentBudget.customer_spend_limit,
    currency: hasOwn(source, "currency") ? currencyOrNull(source.currency) : currentBudget.currency,
    paid_reasoning_pass_limit:
      hasOwn(source, "paid_reasoning_pass_limit") || hasOwn(source, "rolling_24h_paid_reasoning_pass_limit")
        ? positiveIntegerOrNull(source.paid_reasoning_pass_limit ?? source.rolling_24h_paid_reasoning_pass_limit, "paid_reasoning_pass_limit")
        : currentBudget.paid_reasoning_pass_limit,
    minimum_wallet_balance: hasOwn(source, "minimum_wallet_balance")
      ? finiteOrNull(source.minimum_wallet_balance, "minimum_wallet_balance") ?? 0
      : currentBudget.minimum_wallet_balance,
    deep_reasoning_on_change: hasOwn(source, "deep_reasoning_on_change")
      ? source.deep_reasoning_on_change !== false
      : currentBudget.deep_reasoning_on_change !== false,
  };
}

function requestedDeliveryPolicy(body, projectState) {
  const hasDeliveryPolicy = hasOwn(body, "delivery_policy") || hasOwn(body, "deliveryPolicy");
  if (!hasDeliveryPolicy) return normalizeOperatorProactiveDeliveryPolicy(projectState);
  return normalizeOperatorProactiveDeliveryPolicySource(
    object(body.delivery_policy || body.deliveryPolicy),
    { strict: true },
  );
}

async function deliveryChannelReadiness(organizationId) {
  return Promise.all(
    operatorProactiveDeliveryChannelCatalog().map(async (channel) => {
      try {
        const service = await OrganizationServiceRuntime.get({
          organization_id: organizationId,
          service_id: channel.service_id,
        });
        const status = text(service?.status, 80).toUpperCase();
        return {
          ...channel,
          organization_service_exists: Boolean(service),
          active: status === "ACTIVE",
          usage_enabled: service?.usage_enabled !== false,
          ready_for_execution:
            Boolean(service) && status === "ACTIVE" && service?.usage_enabled !== false,
        };
      } catch (error) {
        return {
          ...channel,
          organization_service_exists: false,
          active: false,
          usage_enabled: false,
          ready_for_execution: false,
          status_error: text(error?.message || error, 180) || "Service readiness unavailable",
        };
      }
    }),
  );
}

async function responsePayload({ organizationId, projectState, revealDestinations = false }) {
  let budgetStatus = null;
  try {
    budgetStatus = cognitionBudgetSummary(
      await evaluateAutonomousCognitionBudget({ organizationId, projectState }),
    );
  } catch (error) {
    budgetStatus = {
      allowed: false,
      reason: text(error?.message || error, 180) || "COGNITION_STATUS_UNAVAILABLE",
    };
  }
  const thesis = object(projectState?.business_thesis);
  return {
    success: true,
    settings: settingsFromProjectState(projectState, { revealDestinations }),
    budget_status: budgetStatus,
    prediction_accountability: operatorPredictionAccountabilitySummary(thesis.prediction_accountability),
    proactive_delivery_status: operatorProactiveDeliveryStatus(projectState),
    proactive_delivery_channels: await deliveryChannelReadiness(organizationId),
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId"), 120) || text(url.searchParams.get("organization_id"), 120);
    const resolved = await resolveConversation(request, organizationId);
    if (resolved.error) return resolved.error;
    const projectState = object(resolved.snapshot?.conversation?.project_state);
    const revealDestinations = FULL_ACCESS_ROLES.has(normalizedRole(resolved.access.role));
    return Response.json(await responsePayload({
      organizationId: resolved.access.organizationId,
      projectState,
      revealDestinations,
    }));
  } catch (error) {
    return errorResponse(error?.message || "Autonomous watch settings load failed", error?.status || 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id, 120);
    const resolved = await resolveConversation(request, organizationId);
    if (resolved.error) return resolved.error;
    if (!FULL_ACCESS_ROLES.has(normalizedRole(resolved.access.role))) {
      return errorResponse("Organization owner access is required to change autonomous cognition or proactive delivery settings", 403);
    }
    const conversationId = resolved.snapshot?.conversation?.id;
    if (!conversationId) return errorResponse("Primary intelligence conversation not found", 404);

    const deliveryPolicyWasRequested = hasOwn(body, "delivery_policy") || hasOwn(body, "deliveryPolicy");
    const persisted = await mutateOperatorWatchProjectState({
      organizationId: resolved.access.organizationId,
      partyId: resolved.partyId,
      conversationId,
      mutate: ({ projectState }) => {
        const current = object(projectState);
        const watch = object(current.business_watch);
        const currentBudget = normalizeAutonomousCognitionBudget(current);
        const cognitionBudget = requestedBudget(body, currentBudget);
        const deliveryPolicy = requestedDeliveryPolicy(body, current);
        const enabled = hasOwn(body, "enabled") ? body.enabled !== false : watch.enabled !== false;
        const externalDelivery = deliveryPolicyWasRequested && deliveryPolicy.enabled === false
          ? {
              ...object(watch.external_delivery),
              pending_alert: null,
              channels: {},
              canceled_at: new Date().toISOString(),
              cancel_reason: "OWNER_DISABLED_PROACTIVE_DELIVERY",
            }
          : object(watch.external_delivery);
        const nextProjectState = mergeOperatorProjectState(
          current,
          current,
          {
            business_watch: {
              ...watch,
              enabled,
              cognition_budget: cognitionBudget,
              delivery_policy: deliveryPolicy,
              external_delivery: externalDelivery,
              settings_updated_at: new Date().toISOString(),
              settings_updated_by_party_id: resolved.partyId,
            },
          },
        );
        return {
          projectState: nextProjectState,
          outcome: { settings: settingsFromProjectState(nextProjectState, { revealDestinations: true }) },
        };
      },
    });

    const projectState = object(persisted.projectState);
    const payload = await responsePayload({
      organizationId: resolved.access.organizationId,
      projectState,
      revealDestinations: true,
    });
    return Response.json({ ...payload, persistence_attempts: Number(persisted.attempt || 1) });
  } catch (error) {
    const message = text(error?.message || error, 500);
    const status = /must be|required|unsupported|only one|valid|credential|secret|currency/i.test(message)
      ? 400
      : error?.status || 500;
    return errorResponse(message || "Autonomous watch settings update failed", status);
  }
}
