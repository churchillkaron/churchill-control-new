export const CHURCHILL_ORGANIZATION_ID =
  "33336a72-acb5-474e-856b-8be0269360e2";
export const COLE_LEY_ORGANIZATION_ID =
  "9550b843-b83c-4d15-b02d-a0b5ca23346e";
export const PLATFORM_LOGIN_BRAND_SESSION_KEY = "avantiqo_login_brand";

const DEFAULT_HOST_CONTEXT = Object.freeze({
  id: "avantiqo",
  name: "Avantiqo",
  displayName: "Avantiqo Platform",
  organizationId: null,
  logoSrc: "/branding/avantiqo-logo.png",
  logoAlt: "Avantiqo",
  identityLabel: "Avantiqo",
  tagline: "Business Operating System",
  strapline: "Create · Operate · Scale",
  welcomeTitle: "Welcome to Avantiqo",
  workspaceTitle: "Avantiqo Platform",
  workspaceDescription:
    "Business Operating System for multi-company, multi-industry operations.",
  runtimeLabel: "Avantiqo Runtime Active",
  securityLabel: "Protected by Avantiqo Identity",
});

const CHURCHILL_CONTEXT = Object.freeze({
  id: "churchill",
  name: "Churchill",
  displayName: "Churchill Restaurant & Bar",
  organizationId: CHURCHILL_ORGANIZATION_ID,
  logoSrc: "/branding/churchill1.png",
  logoAlt: "Churchill Restaurant & Bar",
  identityLabel: "Churchill",
  tagline: "Restaurant Operating System",
  strapline: "Control · Operate · Grow",
  welcomeTitle: "Welcome to Churchill",
  workspaceTitle: "Churchill Restaurant & Bar",
  workspaceDescription:
    "Restaurant operating system for operations, staff, finance, procurement, inventory, marketing and management.",
  runtimeLabel: "Churchill Operations Active",
  securityLabel: "Secure Churchill Access",
});

const COLE_LEY_CONTEXT = Object.freeze({
  id: "coleley",
  name: "Cole Ley",
  displayName: "Cole Ley Co., Ltd.",
  organizationId: COLE_LEY_ORGANIZATION_ID,
  logoSrc:
    "https://raw.githubusercontent.com/churchillkaron/Cole-Ley-/main/public/cole-logo1.png",
  logoAlt: "Cole Ley",
  identityLabel: "Cole Ley",
  tagline: "Artist Agency Operating System",
  strapline: "Book · Perform · Grow",
  welcomeTitle: "Welcome to Cole Ley",
  workspaceTitle: "Cole Ley Co., Ltd.",
  workspaceDescription:
    "Artist agency operating system for enquiries, bookings, contracts, schedules, show delivery, finance and management.",
  runtimeLabel: "Cole Ley Operations Active",
  securityLabel: "Secure Cole Ley Access",
});

const HOST_CONTEXTS = Object.freeze([
  Object.freeze({
    domains: Object.freeze(["churchillkaron.com"]),
    context: CHURCHILL_CONTEXT,
  }),
  Object.freeze({
    domains: Object.freeze(["coleley.com"]),
    context: COLE_LEY_CONTEXT,
  }),
]);

const LOGIN_BRAND_CONTEXTS = Object.freeze({
  churchill: CHURCHILL_CONTEXT,
  coleley: COLE_LEY_CONTEXT,
  "cole-ley": COLE_LEY_CONTEXT,
});

export function normalizePlatformHostname(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";

  try {
    if (raw.includes("://")) {
      return new URL(raw).hostname.replace(/\.$/, "");
    }
  } catch {
    return "";
  }

  return raw.split(",")[0].trim().split(":")[0].replace(/\.$/, "");
}

function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function browserBootstrappedContext(normalizedHostname) {
  if (typeof window === "undefined") return null;

  const bootstrap = window.__AVANTIQO_HOST_CONTEXT__;
  const bootstrapHostname = normalizePlatformHostname(bootstrap?.hostname);

  if (!bootstrapHostname || bootstrapHostname !== normalizedHostname) {
    return null;
  }

  const context = bootstrap?.context;

  return context && typeof context === "object" ? context : null;
}

export function resolvePlatformHostContext(hostname) {
  const normalizedHostname = normalizePlatformHostname(hostname);
  const bootstrappedContext = browserBootstrappedContext(normalizedHostname);

  if (bootstrappedContext) return bootstrappedContext;

  const match = HOST_CONTEXTS.find(({ domains }) =>
    domains.some((domain) => matchesDomain(normalizedHostname, domain))
  );

  return match?.context || DEFAULT_HOST_CONTEXT;
}

export function resolvePlatformLoginContext(hostname, brandHint = null) {
  const hostContext = resolvePlatformHostContext(hostname);
  if (hostContext.id !== DEFAULT_HOST_CONTEXT.id) return hostContext;

  const normalizedHint = String(brandHint || "").trim().toLowerCase();
  return LOGIN_BRAND_CONTEXTS[normalizedHint] || hostContext;
}

export function requestPlatformHostname(request) {
  const forwardedHost = request?.headers?.get?.("x-forwarded-host");
  const requestHost = request?.headers?.get?.("host");
  const headerHostname = normalizePlatformHostname(forwardedHost || requestHost);

  if (headerHostname) return headerHostname;

  try {
    return normalizePlatformHostname(new URL(request?.url || "").hostname);
  } catch {
    return "";
  }
}

export function publicPlatformBrand(context = DEFAULT_HOST_CONTEXT) {
  return {
    id: context.id,
    name: context.name,
    displayName: context.displayName,
    logoSrc: context.logoSrc,
    logoAlt: context.logoAlt,
    identityLabel: context.identityLabel,
    tagline: context.tagline,
    strapline: context.strapline,
    welcomeTitle: context.welcomeTitle,
    workspaceTitle: context.workspaceTitle,
    workspaceDescription: context.workspaceDescription,
    runtimeLabel: context.runtimeLabel,
    securityLabel: context.securityLabel,
  };
}