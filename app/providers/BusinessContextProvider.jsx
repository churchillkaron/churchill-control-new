"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";

import { getPublicSupabaseUrl } from "@/lib/shared/supabase/publicConfig";

const BusinessContext = createContext(null);

let browserSupabasePromise = null;
async function getBrowserSupabase() {
  if (!browserSupabasePromise) {
    browserSupabasePromise = import("@/lib/shared/supabase/client").then((module) => module.supabase);
  }
  return browserSupabasePromise;
}

const EMPTY_STATE = {
  ready: false,
  loading: true,
  user: null,
  staff: null,
  organization: null,
  organizations: [],
  organization_id: null,
  is_platform_operator_workspace: false,
  operator_legal_entity: null,
  operator_accounting_organization_id: null,
  operator_accounting_period: null,
  operator_accounting_period_id: null,
  entity: null,
  entities: [],
  entity_id: null,
  period: null,
  period_id: null,
  country: null,
  currency: null,
  modules: [],
  product_entitlements: [],
  permissions: [],
  role: null,
  error: null,
  loading_message: "Preparing your workspace...",
};

function text(value) {
  return String(value ?? "").trim();
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function decodeBase64Url(value) {
  const source = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = source + "=".repeat((4 - (source.length % 4 || 4)) % 4);
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function browserSupabaseAccessToken() {
  if (typeof document === "undefined") return null;
  let projectRef = "";
  try {
    projectRef = new URL(getPublicSupabaseUrl()).hostname.split(".")[0] || "";
  } catch {
    return null;
  }
  if (!projectRef) return null;

  const storageKey = `sb-${projectRef}-auth-token`;
  const cookies = new Map(
    document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=");
        const name = separator >= 0 ? entry.slice(0, separator) : entry;
        const value = separator >= 0 ? entry.slice(separator + 1) : "";
        return [name, value];
      }),
  );

  let encoded = cookies.get(storageKey) || "";
  if (!encoded) {
    const chunks = [];
    for (let index = 0; index < 20; index += 1) {
      const chunk = cookies.get(`${storageKey}.${index}`);
      if (chunk == null) break;
      chunks.push(chunk);
    }
    encoded = chunks.join("");
  }

  const candidates = [];
  if (encoded) candidates.push(encoded);
  try {
    const localValue = window.localStorage?.getItem?.(storageKey);
    if (localValue) candidates.push(localValue);
  } catch {
    // Safari privacy/storage restrictions may deny localStorage access.
  }

  for (const candidate of candidates) {
    try {
      const decoded = candidate.startsWith("base64-")
        ? decodeBase64Url(candidate.slice("base64-".length))
        : decodeURIComponent(candidate);
      const session = JSON.parse(decoded);
      const accessToken = text(session?.access_token || session?.currentSession?.access_token);
      if (accessToken) return accessToken;
    } catch {
      // Try the next supported browser storage representation.
    }
  }
  return null;
}

function timeoutPromise(promise, timeoutMs, code) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(code)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

const bootstrapInflight = new Map();

function bootstrapRequestKey(url, accessToken) {
  return `${url}|${accessToken || "cookie-session"}`;
}

async function fetchBusinessBootstrap(bootstrapUrl, accessToken) {
  const key = bootstrapRequestKey(bootstrapUrl, accessToken);
  const existing = bootstrapInflight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort("WORKSPACE_BOOTSTRAP_FETCH_TIMEOUT"), 8000);
    try {
      const response = await fetch(bootstrapUrl, {
        method: "GET",
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : {},
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload?.error || payload?.reason || "Business context bootstrap failed");
        error.status = response.status;
        error.code = payload?.reason || payload?.code || null;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError" || controller.signal.aborted) {
        const timeoutError = new Error("WORKSPACE_BOOTSTRAP_FETCH_TIMEOUT");
        timeoutError.cause = error;
        throw timeoutError;
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  })();

  bootstrapInflight.set(key, request);
  request.finally(() => {
    if (bootstrapInflight.get(key) === request) bootstrapInflight.delete(key);
  }).catch(() => null);
  return request;
}

function retryableBootstrapError(error) {
  const message = text(error?.message || error).toLowerCase();
  const status = Number(error?.status || error?.cause?.status || 0);
  return [408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524].includes(status)
    || /authretryablefetcherror|fetch failed|headers timeout|network|timeout|522|521|520/.test(message);
}

async function retryBootstrapStep(operation, { attempts = 3, timeoutMs = 12000, onRetry = null } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await timeoutPromise(Promise.resolve().then(operation), timeoutMs, "WORKSPACE_BOOTSTRAP_TIMEOUT");
    } catch (error) {
      lastError = error;
      if (!retryableBootstrapError(error) || attempt >= attempts) throw error;
      if (typeof onRetry === "function") onRetry(attempt, error);
      await wait([600, 1400, 3000][attempt - 1] || 3000);
    }
  }
  throw lastError || new Error("WORKSPACE_BOOTSTRAP_FAILED");
}

function workspaceOrganizationId(pathname) {
  const match = String(pathname || "").match(/^\/workspace\/([^/]+)/);
  const candidate = text(match?.[1]);
  if (!candidate || candidate.toLowerCase() === "platform") return null;

  try {
    return decodeURIComponent(candidate);
  } catch {
    return candidate;
  }
}

function emailLocalPart(value) {
  const email = text(value);
  const local = email.includes("@") ? email.split("@")[0] : "";
  if (!local) return "";

  return local
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function authenticatedPersonName(user, staff) {
  return (
    text(staff?.name) ||
    text(staff?.display_name) ||
    text(staff?.full_name) ||
    text(user?.user_metadata?.full_name) ||
    text(user?.user_metadata?.name) ||
    text(user?.user_metadata?.display_name) ||
    emailLocalPart(user?.email || staff?.email)
  );
}

function canonicalStaff(user, staff) {
  if (!staff && !user) return null;
  const source = staff && typeof staff === "object" ? staff : {};
  const name = authenticatedPersonName(user, source);

  return {
    ...source,
    ...(name ? { name, display_name: source.display_name || name } : {}),
    email: source.email || user?.email || null,
  };
}

export function BusinessContextProvider({ children }) {
  const pathname = usePathname();
  const routeOrganizationId = useMemo(
    () => workspaceOrganizationId(pathname),
    [pathname],
  );
  const developerWorkspace = useMemo(
    () => /^\/workspace\/[^/]+\/developers(?:\/|$)/.test(String(pathname || "")),
    [pathname],
  );
  const publicBusinessContextRoute = useMemo(
    () => !pathname || pathname === "/" || /^\/login(?:\/|$)/.test(String(pathname)),
    [pathname],
  );
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    let mounted = true;

    async function loadBusinessContext() {
      try {
        if (publicBusinessContextRoute) {
          setState({
            ...EMPTY_STATE,
            ready: true,
            loading: false,
          });
          return;
        }
        setState((previous) => ({
          ...previous,
          ready: false,
          loading: true,
          error: null,
          loading_message: "Checking your secure Avantiqo session...",
        }));
        let user = null;

        // Developer Portal routes have their own organization-scoped authority.
        // Keep their lightweight browser-session path isolated from the normal
        // staff/business workspace bootstrap.
        if (developerWorkspace && routeOrganizationId) {
          const {
            data: { session },
          } = await retryBootstrapStep(
            async () => (await getBrowserSupabase()).auth.getSession(),
            {
              timeoutMs: 5000,
              onRetry: (attempt) => setState((previous) => ({
                ...previous,
                loading: true,
                loading_message: `The local developer session is temporarily unavailable. Retrying automatically · ${attempt}/3`,
              })),
            },
          );
          user = session?.user || null;
          if (!mounted) return;
          if (!user) {
            setState({
              ...EMPTY_STATE,
              ready: true,
              loading: false,
            });
            return;
          }
          setState({
            ...EMPTY_STATE,
            ready: true,
            loading: false,
            user,
            organization: { id: routeOrganizationId },
            organizations: [{ id: routeOrganizationId }],
            organization_id: routeOrganizationId,
            error: null,
          });
          return;
        }

        setState((previous) => ({
          ...previous,
          ready: false,
          loading: true,
          error: null,
        }));

        // The organization encoded in /workspace/:organizationId is the
        // authoritative navigation context. Bootstrap validates that organization
        // directly against the authenticated user's available organizations, so a
        // separate selection write is not required before the workspace can load.
        setState((previous) => ({
          ...previous,
          loading: true,
          loading_message: "Loading the organization workspace...",
        }));
        const data = await retryBootstrapStep(async () => {
          const bootstrapUrl = routeOrganizationId
            ? `/api/session/bootstrap?organizationId=${encodeURIComponent(routeOrganizationId)}`
            : "/api/session/bootstrap";
          const accessToken = browserSupabaseAccessToken();
          return fetchBusinessBootstrap(bootstrapUrl, accessToken);
        }, {
          attempts: 3,
          timeoutMs: 7000,
          onRetry: (attempt) => setState((previous) => ({
            ...previous,
            ready: false,
            loading: true,
            error: null,
            loading_message: `Workspace connection is temporarily slow. Retrying automatically · ${attempt}/3`,
          })),
        });

        if (!mounted) return;

        user = data?.user || null;

        if (!data?.success) {
          setState((previous) => ({
            ...previous,
            ready: true,
            loading: false,
            user,
            staff: canonicalStaff(user, null),
            organization: null,
            organizations: [],
            organization_id: null,
            is_platform_operator_workspace: false,
            operator_legal_entity: null,
            operator_accounting_organization_id: null,
            operator_accounting_period: null,
            operator_accounting_period_id: null,
            entity: null,
            entity_id: null,
            period: null,
            period_id: null,
            entities: [],
            modules: [],
            product_entitlements: [],
            permissions: [],
            error: data?.error || data?.reason || "Business context bootstrap failed",
          }));
          return;
        }

        const organizationId =
          data.active_organization_id ||
          data.organization_id ||
          data.staff?.active_organization_id ||
          null;
        const staff = canonicalStaff(user, data.staff || null);

        if (routeOrganizationId && organizationId !== routeOrganizationId) {
          throw new Error("Workspace organization did not synchronize correctly");
        }

        setState({
          ready: true,
          loading: false,
          user,
          staff,
          organization: data.organization || null,
          organizations: Array.isArray(data.organizations)
            ? data.organizations
            : data.organization
              ? [data.organization]
              : [],
          organization_id: organizationId,
          is_platform_operator_workspace:
            data.is_platform_operator_workspace === true,
          operator_legal_entity: data.operator_legal_entity || null,
          operator_accounting_organization_id:
            data.operator_accounting_organization_id || null,
          operator_accounting_period: data.operator_accounting_period || null,
          operator_accounting_period_id:
            data.operator_accounting_period_id || null,
          entity: data.entity || null,
          entities: Array.isArray(data.entities)
            ? data.entities
            : data.entity
              ? [data.entity]
              : [],
          entity_id: data.entity_id || data.active_entity_id || null,
          period: data.period || null,
          period_id: data.period_id || data.active_period_id || null,
          country:
            data.country ||
            data.entity?.country ||
            data.organization?.country ||
            null,
          currency:
            data.currency ||
            data.entity?.currency ||
            data.organization?.default_currency ||
            null,
          modules: Array.isArray(data.modules) ? data.modules : [],
          product_entitlements: Array.isArray(data.product_entitlements) ? data.product_entitlements : [],
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
          role: data.role || staff?.role || null,
          error: null,
        });
      } catch (error) {
        console.error("Business context load failed", error);

        if (!mounted) return;

        const temporary = retryableBootstrapError(error);
        setState((previous) => ({
          ...previous,
          ready: true,
          loading: false,
          organization: null,
          organization_id: null,
          entity: null,
          entity_id: null,
          period: null,
          period_id: null,
          organizations: [],
          entities: [],
          modules: [],
          product_entitlements: [],
          permissions: [],
          is_platform_operator_workspace: false,
          error: error?.code === "AUTHENTICATION_REQUIRED" || Number(error?.status) === 401
            ? "Your Avantiqo session expired. Sign in again to continue this workspace."
            : temporary
              ? "The Avantiqo workspace connection is temporarily unavailable. Your local Code workspace was not changed and the current work state is preserved. Retry when workspace services respond again."
              : error.message,
          error_code: error?.code
            || (Number(error?.status) === 401
              ? "AUTHENTICATION_REQUIRED"
              : temporary
                ? "WORKSPACE_SERVICE_UNAVAILABLE"
                : null),
          loading_message: null,
        }));
      }
    }

    loadBusinessContext();

    return () => {
      mounted = false;
    };
  }, [developerWorkspace, publicBusinessContextRoute, routeOrganizationId]);

  const value = useMemo(() => state, [state]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusinessContext() {
  return useContext(BusinessContext);
}
