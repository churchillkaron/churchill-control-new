export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  loadIntelligenceConversationSnapshot,
} from "@/lib/operator/runtime/IntelligenceConversationRuntime";
import {
  mutateOperatorWatchProjectState,
} from "@/lib/operator/runtime/OperatorWatchStateRepository";
import {
  cognitionBudgetSummary,
  evaluateAutonomousCognitionBudget,
  normalizeAutonomousCognitionBudget,
} from "@/lib/operator/runtime/OperatorAutonomousCognitionPolicy";
import {
  mergeOperatorProjectState,
} from "@/lib/operator/contracts/OperatorProjectState";

const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${field} must be a non-negative number or null`);
  }
  return numeric;
}

function positiveIntegerOrNull(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${field} must be a positive integer or null`);
  }
  return numeric;
}

function currencyOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = text(value, 12).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("currency must be a 3-letter ISO currency code or null");
  }
  return normalized;
}

function errorResponse(error, status = 500) {
  return Response.json({ success: false, error }, { status });
}

async function resolveConversation(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) {
    return { error: errorResponse(access.error, access.status || 403) };
  }
  const partyId = text(access.staff?.party_id || access.staff?.partyId, 120);
  if (!partyId) {
    return {
      error: errorResponse(
        "Authenticated staff account is not linked to a party",
        409,
      ),
    };
  }
  const snapshot = await loadIntelligenceConversationSnapshot({
    organizationId: access.organizationId,
    partyId,
    conversationKey: "primary",
  });
  return { access, partyId, snapshot };
}

function settingsFromProjectState(projectState) {
  const watch = object(projectState?.business_watch);
  return {
    enabled: watch.enabled !== false,
    cognition_budget: normalizeAutonomousCognitionBudget(projectState),
    last_cognition: object(watch.last_cognition),
    last_checked_at: text(watch.last_checked_at, 80) || null,
    next_check_at: text(watch.next_check_at, 80) || null,
    last_thesis_level: text(watch.last_thesis_level, 40) || null,
  };
}

function requestedBudget(body, currentBudget) {
  const source = object(body?.cognition_budget || body?.cognitionBudget);
  return {
    enabled: hasOwn(source, "enabled")
      ? source.enabled !== false
      : currentBudget.enabled !== false,
    customer_spend_limit:
      hasOwn(source, "customer_spend_limit") ||
      hasOwn(source, "rolling_24h_customer_spend_limit")
        ? finiteOrNull(
            source.customer_spend_limit ??
              source.rolling_24h_customer_spend_limit,
            "customer_spend_limit",
          )
        : currentBudget.customer_spend_limit,
    currency: hasOwn(source, "currency")
      ? currencyOrNull(source.currency)
      : currentBudget.currency,
    paid_reasoning_pass_limit:
      hasOwn(source, "paid_reasoning_pass_limit") ||
      hasOwn(source, "rolling_24h_paid_reasoning_pass_limit")
        ? positiveIntegerOrNull(
            source.paid_reasoning_pass_limit ??
              source.rolling_24h_paid_reasoning_pass_limit,
            "paid_reasoning_pass_limit",
          )
        : currentBudget.paid_reasoning_pass_limit,
    minimum_wallet_balance: hasOwn(source, "minimum_wallet_balance")
      ? finiteOrNull(source.minimum_wallet_balance, "minimum_wallet_balance") ?? 0
      : currentBudget.minimum_wallet_balance,
    deep_reasoning_on_change: hasOwn(source, "deep_reasoning_on_change")
      ? source.deep_reasoning_on_change !== false
      : currentBudget.deep_reasoning_on_change !== false,
  };
}

async function responsePayload({ organizationId, projectState }) {
  let budgetStatus = null;
  try {
    budgetStatus = cognitionBudgetSummary(
      await evaluateAutonomousCognitionBudget({
        organizationId,
        projectState,
      }),
    );
  } catch (error) {
    budgetStatus = {
      allowed: false,
      reason: text(error?.message || error, 180) || "COGNITION_STATUS_UNAVAILABLE",
    };
  }
  return {
    success: true,
    settings: settingsFromProjectState(projectState),
    budget_status: budgetStatus,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId =
      text(url.searchParams.get("organizationId"), 120) ||
      text(url.searchParams.get("organization_id"), 120);
    const resolved = await resolveConversation(request, organizationId);
    if (resolved.error) return resolved.error;
    const projectState = object(resolved.snapshot?.conversation?.project_state);
    return Response.json(
      await responsePayload({
        organizationId: resolved.access.organizationId,
        projectState,
      }),
    );
  } catch (error) {
    return errorResponse(
      error?.message || "Autonomous watch settings load failed",
      error?.status || 500,
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(
      body.organizationId || body.organization_id,
      120,
    );
    const resolved = await resolveConversation(request, organizationId);
    if (resolved.error) return resolved.error;
    if (!FULL_ACCESS_ROLES.has(normalizedRole(resolved.access.role))) {
      return errorResponse(
        "Organization owner access is required to change autonomous cognition settings",
        403,
      );
    }
    const conversationId = resolved.snapshot?.conversation?.id;
    if (!conversationId) {
      return errorResponse("Primary intelligence conversation not found", 404);
    }

    const persisted = await mutateOperatorWatchProjectState({
      organizationId: resolved.access.organizationId,
      partyId: resolved.partyId,
      conversationId,
      mutate: ({ projectState }) => {
        const current = object(projectState);
        const watch = object(current.business_watch);
        const currentBudget = normalizeAutonomousCognitionBudget(current);
        const cognitionBudget = requestedBudget(body, currentBudget);
        const enabled = hasOwn(body, "enabled")
          ? body.enabled !== false
          : watch.enabled !== false;
        const nextProjectState = mergeOperatorProjectState(
          current,
          current,
          {
            business_watch: {
              ...watch,
              enabled,
              cognition_budget: cognitionBudget,
              settings_updated_at: new Date().toISOString(),
              settings_updated_by_party_id: resolved.partyId,
            },
          },
        );
        return {
          projectState: nextProjectState,
          outcome: { settings: settingsFromProjectState(nextProjectState) },
        };
      },
    });

    const projectState = object(persisted.projectState);
    const payload = await responsePayload({
      organizationId: resolved.access.organizationId,
      projectState,
    });
    return Response.json({
      ...payload,
      persistence_attempts: Number(persisted.attempt || 1),
    });
  } catch (error) {
    const status = /must be|currency/i.test(text(error?.message)) ? 400 : error?.status || 500;
    return errorResponse(
      error?.message || "Autonomous watch settings update failed",
      status,
    );
  }
}
