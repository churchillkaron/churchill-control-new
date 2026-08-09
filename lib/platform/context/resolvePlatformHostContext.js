export const CHURCHILL_ORGANIZATION_ID =
  "33336a72-acb5-474e-856b-8be0269360e2";

const DEFAULT_HOST_CONTEXT = Object.freeze({
  id: "avantiqo",
  name: "Avantiqo",
  displayName: "Avantiqo Platform",
  organizationId: null,
  logoSrc: "/app/branding/avantiqo-logo.webp",
  logoAlt: "Avantiqo",
  identityLabel: "Avantiqo",
  tagline: "Synthetic Intelligence Operating System",
  strapline: "Create · Operate · Scale",
  welcomeTitle: "Welcome to Avantiqo",
  workspaceTitle: "Avantiqo Platform",
  workspaceDescription:
    "Enterprise Operating System for hospitality, accounting, services, entertainment and multi-company operations.",
  runtimeLabel: "Enterprise Runtime Active",
  securityLabel: "Protected by Avantiqo Identity",
});

const HOST_CONTEXTS = Object.freeze([
  Object.freeze({
    domains: Object.freeze(["churchillkaron.com"]),
    context: Object.freeze({
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
    }),
  }),
]);

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

export function resolvePlatformHostContext(hostname) {
  const normalizedHostname = normalizePlatformHostname(hostname);

  const match = HOST_CONTEXTS.find(({ domains }) =>
    domains.some((domain) => matchesDomain(normalizedHostname, domain))
  );

  return match?.context || DEFAULT_HOST_CONTEXT;
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
