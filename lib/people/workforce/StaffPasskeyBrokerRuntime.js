import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

import {
  createOAuthAuthorization,
  inspectOAuthAuthorization,
  consumeOAuthAuthorization,
} from "@/lib/platform/security/oauthAuthorizationState";
import {
  normalizePlatformHostname,
  requestPlatformHostname,
} from "@/lib/platform/context/resolvePlatformHostContext";
import {
  resolveRegisteredPlatformHostContext,
} from "@/lib/platform/context/resolveRegisteredPlatformHostContext";
import {
  getPublicSupabaseKey,
  getPublicSupabaseUrl,
} from "@/lib/shared/supabase/publicConfig";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const STAFF_PASSKEY_BROKER_PROVIDER = "avantiqo_staff_passkey";
export const STAFF_PASSKEY_BROKER_PURPOSE = "staff_portal_login";
export const STAFF_PASSKEY_ENROLLMENT_PURPOSE = "staff_passkey_enrollment";
export const STAFF_PASSKEY_AUTH_ORIGIN = "https://auth.avantiqo.ai";

export function requireStaffPasskeyAuthOrigin(request) {
  const hostname = requestPlatformHostname(request);
  const brokerHostname = new URL(STAFF_PASSKEY_AUTH_ORIGIN).hostname;
  const developmentLoopback =
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1"].includes(hostname);

  if (!developmentLoopback && hostname !== brokerHostname) {
    const error = new Error("Staff passkey broker must run on the Avantiqo identity origin");
    error.status = 403;
    throw error;
  }

  return hostname;
}

function normalizeReturnPath(value) {
  const path = String(value || "/staff").trim();
  if (!path.startsWith("/") || path.startsWith("//")) return "/staff";
  return path.startsWith("/staff") ? path : "/staff";
}

function requestExternalOrigin(request, expectedHostname = null) {
  const forwardedHost = String(request?.headers?.get?.("x-forwarded-host") || "").split(",")[0].trim();
  const requestHost = String(request?.headers?.get?.("host") || "").split(",")[0].trim();
  const rawHost = forwardedHost || requestHost;
  const hostname = normalizePlatformHostname(rawHost);
  if (!hostname || (expectedHostname && hostname !== expectedHostname)) {
    throw new Error("External request hostname is invalid");
  }

  const forwardedProto = String(request?.headers?.get?.("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  let protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : "";
  if (!protocol) {
    try {
      protocol = new URL(request.url).protocol.replace(":", "");
    } catch {
      protocol = "";
    }
  }
  if (!["http", "https"].includes(protocol)) throw new Error("External request protocol is invalid");
  if (protocol === "http" && !["localhost", "127.0.0.1"].includes(hostname) && !rawHost.includes(":3016")) {
    throw new Error("Customer staff origin must use HTTPS");
  }
  return `${protocol}://${rawHost}`;
}

function activeRecord(row = {}) {
  if (row.active === false || row.is_active === false) return false;
  const status = String(row.status || "").trim().toUpperCase();
  return !["INACTIVE","DISABLED","SUSPENDED","TERMINATED","ARCHIVED","REVOKED"].includes(status);
}

export async function resolveOrganizationStaffPortalOrigin(organizationId) {
  const { data: assets, error } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("external_id,metadata,selected_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("channel_provider", "avantiqo")
    .eq("asset_type", "platform_hostname")
    .order("selected_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (error) throw error;

  const preferred = (assets || []).find((row) => {
    const hostname = normalizePlatformHostname(row.external_id);
    if (!hostname) return false;
    const status = String(row.metadata?.status || "").trim().toUpperCase();
    if (status && !["ACTIVE", "READY", "VERIFIED", "LIVE"].includes(status)) return false;
    if (row.metadata?.staff_portal === false) return false;
    return true;
  });
  if (preferred?.external_id) return `https://${normalizePlatformHostname(preferred.external_id)}`;

  const errorMissing = new Error("Configure a registered Staff Portal hostname before sending enrollment access");
  errorMissing.status = 409;
  throw errorMissing;
}

export async function createStaffPasskeyBrokerAuthorization({ request, returnPath = "/staff" } = {}) {
  const hostname = requestPlatformHostname(request);
  const hostContext = await resolveRegisteredPlatformHostContext(hostname);
  if (!hostContext?.organizationId) {
    const error = new Error("Staff passkey login must start from a registered customer domain");
    error.status = 400;
    throw error;
  }

  const returnOrigin = requestExternalOrigin(request, hostname);
  const authorization = await createOAuthAuthorization({
    provider: STAFF_PASSKEY_BROKER_PROVIDER,
    purpose: STAFF_PASSKEY_BROKER_PURPOSE,
    organizationId: hostContext.organizationId,
    returnOrigin,
    metadata: {
      return_path: normalizeReturnPath(returnPath),
      source_hostname: hostname,
      host_context_id: hostContext.id || null,
      brand_name: hostContext.displayName || hostContext.name || "Organization",
    },
  });

  return {
    state: authorization.state,
    expiresAt: authorization.expiresAt,
    authorizationUrl: `${STAFF_PASSKEY_AUTH_ORIGIN}/auth/staff/passkey?state=${encodeURIComponent(authorization.state)}`,
    organizationId: hostContext.organizationId,
    brand: {
      name: hostContext.name || "Organization",
      displayName: hostContext.displayName || hostContext.name || "Organization",
      logoSrc: hostContext.logoSrc || null,
      securityLabel: hostContext.securityLabel || "Secure Staff Access",
    },
  };
}

async function validatedAuthorizationContext(state, allowedPurposes = [STAFF_PASSKEY_BROKER_PURPOSE, STAFF_PASSKEY_ENROLLMENT_PURPOSE]) {
  const authorization = await inspectOAuthAuthorization({
    state,
    provider: STAFF_PASSKEY_BROKER_PROVIDER,
  });
  if (!allowedPurposes.includes(authorization.purpose)) {
    throw new Error("Invalid staff passkey authorization purpose");
  }

  const returnOrigin = new URL(authorization.return_origin);
  const hostContext = await resolveRegisteredPlatformHostContext(returnOrigin.hostname);
  if (!hostContext?.organizationId || String(hostContext.organizationId) !== String(authorization.organization_id)) {
    throw new Error("Staff passkey return domain is not registered to this organization");
  }

  return { authorization, hostContext, returnOrigin };
}

export async function createStaffPasskeyEnrollmentAuthorization({
  request,
  organizationId,
  staff,
  user,
  returnPath = "/staff",
} = {}) {
  if (!organizationId || !staff?.id || !user?.id) {
    const error = new Error("Authenticated staff enrollment context required");
    error.status = 401;
    throw error;
  }

  const hostname = requestPlatformHostname(request);
  const hostContext = await resolveRegisteredPlatformHostContext(hostname);
  if (!hostContext?.organizationId || String(hostContext.organizationId) !== String(organizationId)) {
    const error = new Error("Passkey enrollment must start from the staff member's registered customer domain");
    error.status = 403;
    throw error;
  }

  const returnOrigin = requestExternalOrigin(request, hostname);
  const authorization = await createOAuthAuthorization({
    provider: STAFF_PASSKEY_BROKER_PROVIDER,
    purpose: STAFF_PASSKEY_ENROLLMENT_PURPOSE,
    organizationId,
    partyId: staff.party_id || null,
    returnOrigin,
    metadata: {
      return_path: normalizeReturnPath(returnPath),
      source_hostname: hostname,
      host_context_id: hostContext.id || null,
      brand_name: hostContext.displayName || hostContext.name || "Organization",
      auth_user_id: user.id,
      staff_id: staff.id,
    },
  });

  return {
    state: authorization.state,
    expiresAt: authorization.expiresAt,
    handoffUrl: `${STAFF_PASSKEY_AUTH_ORIGIN}/api/auth/staff/passkey/enroll/session`,
    organizationId,
  };
}

export async function establishStaffPasskeyEnrollmentSession({
  request,
  state,
  accessToken,
  refreshToken,
} = {}) {
  requireStaffPasskeyAuthOrigin(request);
  const pending = await validatedAuthorizationContext(state, [STAFF_PASSKEY_ENROLLMENT_PURPOSE]);

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !user?.id) {
    const error = new Error("Invalid staff enrollment session");
    error.status = 401;
    throw error;
  }

  if (String(pending.authorization.metadata?.auth_user_id || "") !== String(user.id)) {
    const error = new Error("Staff enrollment identity does not match the authorization");
    error.status = 403;
    throw error;
  }

  await requireStaffMembership({
    organizationId: pending.authorization.organization_id,
    userId: user.id,
  });

  let response = NextResponse.redirect(
    new URL(`/auth/staff/passkey/enroll?state=${encodeURIComponent(state)}`, STAFF_PASSKEY_AUTH_ORIGIN),
    303,
  );

  const supabase = createServerClient(
    getPublicSupabaseUrl(),
    getPublicSupabaseKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers = {}) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        },
      },
    },
  );

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) {
    const error = new Error("Unable to establish central passkey enrollment session");
    error.status = 401;
    throw error;
  }

  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function loadStaffPasskeyBrokerContext({ state } = {}) {
  const { authorization, hostContext, returnOrigin } = await validatedAuthorizationContext(state);
  return {
    organizationId: authorization.organization_id,
    returnOrigin: returnOrigin.origin,
    returnPath: normalizeReturnPath(authorization.metadata?.return_path),
    expiresAt: authorization.expires_at,
    brand: {
      name: hostContext.name || "Organization",
      displayName: hostContext.displayName || hostContext.name || "Organization",
      logoSrc: hostContext.logoSrc || null,
      securityLabel: hostContext.securityLabel || "Secure Staff Access",
    },
  };
}

async function requireStaffMembership({ organizationId, userId }) {
  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,auth_user_id,active,role,status,active_organization_id")
    .eq("auth_user_id", userId)
    .limit(100);
  if (staffError) throw staffError;

  for (const staff of staffRows || []) {
    if (!activeRecord(staff)) continue;
    if (String(staff.active_organization_id || "") === String(organizationId)) return staff;

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_users")
      .select("organization_id,status,active,is_active")
      .eq("organization_id", organizationId)
      .eq("staff_account_id", staff.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (membership && activeRecord(membership)) return staff;
  }

  const error = new Error("Authenticated user is not active staff in this organization");
  error.status = 403;
  throw error;
}

export async function completeStaffPasskeyBrokerAuthorization({
  request,
  state,
  accessToken,
  refreshToken,
} = {}) {
  const currentHostname = requestPlatformHostname(request);
  const currentOrigin = requestExternalOrigin(request, currentHostname);
  const pending = await validatedAuthorizationContext(state);
  if (pending.returnOrigin.origin !== currentOrigin) {
    const error = new Error("Staff passkey authorization was returned to the wrong origin");
    error.status = 403;
    throw error;
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !user?.id) {
    const error = new Error("Invalid authenticated passkey session");
    error.status = 401;
    throw error;
  }

  const staff = await requireStaffMembership({
    organizationId: pending.authorization.organization_id,
    userId: user.id,
  });

  let response = NextResponse.redirect(
    new URL(
      normalizeReturnPath(pending.authorization.metadata?.return_path),
      currentOrigin,
    ),
    303,
  );

  const supabase = createServerClient(
    getPublicSupabaseUrl(),
    getPublicSupabaseKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers = {}) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        },
      },
    },
  );

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) {
    const error = new Error("Unable to establish customer-domain staff session");
    error.status = 401;
    throw error;
  }

  const consumed = await consumeOAuthAuthorization({
    state,
    provider: STAFF_PASSKEY_BROKER_PROVIDER,
  });

  response.cookies.set("avantiqo_active_organization_id", consumed.organization_id, {
    httpOnly: true,
    sameSite: "lax",
    secure: currentOrigin.startsWith("https://"),
    path: "/",
  });
  response.cookies.set("active_organization_id", consumed.organization_id, {
    httpOnly: true,
    sameSite: "lax",
    secure: currentOrigin.startsWith("https://"),
    path: "/",
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Avantiqo-Staff-Id", staff.id);
  return response;
}
