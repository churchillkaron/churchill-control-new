import { createHash } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const PLATFORM_USER_FAILURE_EVENT_TYPE = "PLATFORM_USER_FAILURE_CAPTURED";
export const PLATFORM_USER_FAILURE_SCHEMA_VERSION = 2;

const FAILURE_CATEGORIES = new Set([
  "organization_context_missing",
  "route_not_found",
  "runtime_exception",
  "workspace_unfinished",
  "capability_unimplemented",
  "request_failure",
]);

const STAFF_INACTIVE_STATUSES = new Set([
  "INACTIVE",
  "DISABLED",
  "SUSPENDED",
  "TERMINATED",
  "ARCHIVED",
  "REVOKED",
]);

function text(value, limit = 400) {
  return String(value ?? "").trim().slice(0, limit);
}

function nullableText(value, limit = 400) {
  return text(value, limit) || null;
}

function normalizePath(value) {
  const candidate = text(value, 800);
  if (!candidate || !candidate.startsWith("/")) return "/";
  return candidate.split("?")[0].split("#")[0].slice(0, 500) || "/";
}

function normalizeCategory(value) {
  const category = text(value, 80).toLowerCase();
  return FAILURE_CATEGORIES.has(category) ? category : "runtime_exception";
}

function normalizeErrorMessage(value) {
  return text(value, 600)
    .replace(/bearer\s+[a-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/(api[_ -]?key|secret|token|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/[?&](?:token|key|secret|code)=[^&\s]+/gi, "?[REDACTED]");
}

function deterministicUuid(input) {
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function recordActive(row = {}) {
  if (row.archived === true || row.active === false || row.is_active === false || row.enabled === false) return false;
  return !STAFF_INACTIVE_STATUSES.has(text(row.status, 80).toUpperCase());
}

async function authenticatedUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  let cookieStore;
  try {
    cookieStore = cookies();
  } catch {
    return null;
  }
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {},
    },
  });
  const { data, error } = await client.auth.getUser();
  return error ? null : data?.user || null;
}

async function deriveOrganizationIdsForUser(user) {
  if (!user?.id) return [];
  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,active_organization_id,active")
    .eq("auth_user_id", user.id)
    .limit(1000);
  if (staffError) throw staffError;

  const staff = (staffRows || []).filter(recordActive);
  const ids = new Set();
  const staffIds = [];
  for (const row of staff) {
    staffIds.push(row.id);
    if (row.active_organization_id) ids.add(String(row.active_organization_id));
  }

  if (staffIds.length) {
    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("organization_users")
      .select("organization_id,status")
      .in("staff_account_id", staffIds)
      .limit(1000);
    if (membershipError) throw membershipError;
    for (const row of memberships || []) {
      if (recordActive(row) && row.organization_id) ids.add(String(row.organization_id));
    }
  }
  return [...ids];
}

async function resolveScope({ request, organizationHint }) {
  const hint = nullableText(organizationHint, 100);
  if (hint) {
    const access = await requireOrganizationAccess({ organizationId: hint, request });
    if (!access.success) {
      return { success: false, status: access.status, error: access.error };
    }
    return {
      success: true,
      user: access.user,
      organizationId: access.organizationId,
      organizationScope: "validated_client_context",
    };
  }

  const user = await authenticatedUser();
  if (!user) return { success: false, status: 401, error: "Authentication required" };
  const organizationIds = await deriveOrganizationIdsForUser(user);
  return {
    success: true,
    user: { id: user.id, email: user.email || null },
    organizationId: organizationIds.length === 1 ? organizationIds[0] : null,
    organizationScope: organizationIds.length === 1 ? "derived_unambiguous_membership" : "ambiguous_or_missing",
  };
}

export async function capturePlatformUserFailure({ request, input = {} } = {}) {
  const scope = await resolveScope({
    request,
    organizationHint: input.organizationId || input.organization_id,
  });
  if (!scope.success) return scope;

  const category = normalizeCategory(input.category);
  const pathname = normalizePath(input.pathname || input.route);
  const errorMessage = normalizeErrorMessage(input.errorMessage || input.error_message || input.message);
  const capability = nullableText(input.capability, 240);
  const workspace = nullableText(input.workspace, 240);
  const action = nullableText(input.action, 240);
  const digest = nullableText(input.digest, 160);
  const rawStatusCode = input.statusCode ?? input.status_code;
  const parsedStatusCode = rawStatusCode === null || rawStatusCode === undefined || rawStatusCode === ""
    ? null
    : Number(rawStatusCode);
  const statusCode = Number.isFinite(parsedStatusCode)
    ? Math.max(100, Math.min(599, parsedStatusCode))
    : null;
  const occurredAt = new Date().toISOString();
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  const fingerprintSource = JSON.stringify({
    userId: scope.user?.id || null,
    organizationId: scope.organizationId,
    category,
    pathname,
    capability,
    workspace,
    errorMessage,
    digest,
    bucket,
  });
  const fingerprint = createHash("sha256").update(fingerprintSource).digest("hex");
  const eventId = deterministicUuid(`platform-user-failure:${fingerprint}`);

  const payload = {
    schema_version: PLATFORM_USER_FAILURE_SCHEMA_VERSION,
    failure_id: eventId,
    signal_key: `user-failure:${eventId}`,
    source: "platform_user_failure_capture",
    category,
    classification_candidate: "EVIDENCE_ONLY",
    occurred_at: occurredAt,
    route: pathname,
    capability,
    workspace,
    action,
    status_code: statusCode,
    error_message: errorMessage || null,
    error_digest: digest,
    evidence_fingerprint: fingerprint,
    organization_scope: scope.organizationScope,
    autonomous_repair_eligible: false,
    replay: {
      route: pathname,
      action,
      capability,
      workspace,
      reconstruct_from_authoritative_state: true,
      raw_request_body_stored: false,
    },
    governance: {
      browser_evidence_authoritative: false,
      organization_client_claim_trusted: false,
      server_membership_validated: Boolean(scope.organizationId),
      raw_stack_stored: false,
      secrets_stored: false,
      classification_requires_authoritative_reread: true,
      autonomous_repair_requires_authoritative_reread: true,
      promotion_requires_governed_verification: true,
    },
  };

  const { error } = await supabaseAdmin.from("system_events").insert({
    id: eventId,
    type: PLATFORM_USER_FAILURE_EVENT_TYPE,
    organization_id: scope.organizationId,
    idempotency_key: `platform-user-failure:${fingerprint}`,
    payload,
    processed: true,
    processed_at: occurredAt,
    processing: false,
    attempt_count: 0,
  });

  if (error && error.code !== "23505") throw error;

  return {
    success: true,
    status: 202,
    eventId,
    signalKey: `user-failure:${eventId}`,
    deduplicated: error?.code === "23505",
    organizationId: scope.organizationId,
    organizationScope: scope.organizationScope,
    classificationCandidate: "EVIDENCE_ONLY",
    autonomousRepairEligible: false,
  };
}
