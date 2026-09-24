export const PLATFORM_LOGIN_BRAND_SESSION_KEY = "avantiqo_login_brand";

const DEFAULT_HOST_CONTEXT = Object.freeze({
  id: "avantiqo",
  name: "Avantiqo",
  displayName: "Avantiqo Platform",
  organizationId: null,
  logoSrc: "/branding/avantiqo-logo.png",
  logoAlt: "Avantiqo",
  logoLayout: "compact",
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
  return bootstrappedContext || DEFAULT_HOST_CONTEXT;
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
    logoLayout: context.logoLayout || "compact",
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