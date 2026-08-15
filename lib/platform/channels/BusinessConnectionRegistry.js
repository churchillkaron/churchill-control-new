const ANY = (...names) => ({ anyOf: names });

function setup({
  summary,
  callbackPaths = [],
  steps = [],
  optionalRequirements = [],
  approval = null,
}) {
  return {
    owner: "AVANTIQO",
    summary,
    callbackPaths,
    steps,
    optionalRequirements,
    approval,
  };
}

function customerSetup(mode, label) {
  return {
    mode,
    label,
    technicalInputRequired: false,
  };
}

export const BUSINESS_CONNECTION_REGISTRY = [
  {
    id: "meta",
    name: "Meta — Facebook, Instagram & Messenger",
    category: "Social media",
    description: "Connect the business Meta identity for Facebook and Instagram publishing, Messenger and Instagram messaging, and Meta Ads.",
    connectionProviders: ["meta"],
    connectPath: "/api/meta/auth",
    authModel: "OAUTH",
    availability: "active",
    platformRequirements: ["META_APP_ID", "META_APP_SECRET"],
    platformSetup: setup({
      summary: "One Avantiqo Meta app serves customer Facebook, Instagram and Messenger connections.",
      callbackPaths: ["/api/meta/auth/callback", "/api/commercial/communications/webhooks/meta"],
      steps: [
        "Configure the Avantiqo Meta app and allowed redirect URLs.",
        "Configure the shared Meta messaging webhook.",
        "Complete Meta app review for the permissions Avantiqo uses.",
      ],
      optionalRequirements: ["META_GRAPH_API_VERSION"],
      approval: "Meta app review may be required before all customer capabilities are public.",
    }),
    customerSetup: customerSetup("PROVIDER_AUTHORIZATION_AND_ASSET_PICKER", "Sign in with Meta and choose the business assets"),
  },
  {
    id: "threads",
    name: "Threads",
    category: "Social media",
    description: "Connect the business Threads profile for publishing, replies and insights.",
    connectionProviders: ["threads"],
    connectPath: "/api/social/threads/auth",
    authModel: "OAUTH",
    availability: "active",
    platformRequirements: ["THREADS_APP_ID", "THREADS_APP_SECRET"],
    platformSetup: setup({
      summary: "One Avantiqo Threads app authorizes customer Threads profiles.",
      callbackPaths: ["/api/social/threads/auth/callback"],
      steps: ["Configure the Avantiqo Threads app and OAuth redirect URL."],
    }),
    customerSetup: customerSetup("PROVIDER_AUTHORIZATION", "Sign in with Threads and approve Avantiqo"),
  },
  {
    id: "tiktok",
    name: "TikTok",
    category: "Social media",
    description: "Connect the TikTok creator account for consent-aware direct publishing and publish-status tracking.",
    connectionProviders: ["tiktok"],
    connectPath: "/api/social/tiktok/auth",
    authModel: "OAUTH",
    availability: "active",
    platformRequirements: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    platformSetup: setup({
      summary: "One Avantiqo TikTok developer app authorizes customer creator accounts.",
      callbackPaths: ["/api/social/tiktok/auth/callback"],
      steps: [
        "Configure the Avantiqo TikTok app and redirect URL.",
        "Complete TikTok Content Posting API review for public posting.",
      ],
      approval: "Unaudited Content Posting API clients can be restricted to private publishing.",
    }),
    customerSetup: customerSetup("PROVIDER_AUTHORIZATION", "Sign in with TikTok and approve Avantiqo"),
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "Social media",
    description: "Connect the LinkedIn identity Avantiqo should use for business publishing.",
    connectionProviders: ["linkedin"],
    connectPath: "/api/social/linkedin/auth",
    authModel: "OAUTH",
    availability: "active",
    platformRequirements: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    platformSetup: setup({
      summary: "One Avantiqo LinkedIn app authorizes customer LinkedIn identities.",
      callbackPaths: ["/api/social/linkedin/auth/callback"],
      steps: [
        "Configure the Avantiqo LinkedIn app and redirect URL.",
        "Request the LinkedIn products and permissions required for organization Page publishing when available.",
      ],
      approval: "Organization Page publishing depends on LinkedIn product entitlement.",
    }),
    customerSetup: customerSetup("PROVIDER_AUTHORIZATION", "Sign in with LinkedIn and approve Avantiqo"),
  },
  {
    id: "x",
    name: "X",
    category: "Social media",
    description: "Connect the X account Avantiqo should publish and manage.",
    connectionProviders: ["x"],
    connectPath: "/api/social/x/auth",
    authModel: "OAUTH_PKCE",
    availability: "active",
    platformRequirements: ["X_CLIENT_ID"],
    platformSetup: setup({
      summary: "One Avantiqo X developer app authorizes customer X accounts with OAuth PKCE.",
      callbackPaths: ["/api/social/x/auth/callback"],
      steps: ["Configure the Avantiqo X app, OAuth 2.0 client and callback URL."],
      optionalRequirements: ["X_CLIENT_SECRET"],
    }),
    customerSetup: customerSetup("PROVIDER_AUTHORIZATION", "Sign in with X and approve Avantiqo"),
  },
  {
    id: "google-business",
    name: "Google Business Profile",
    category: "Business presence",
    description: "Connect locations, reviews and business profile publishing.",
    connectionProviders: ["google"],
    assetProviders: ["google"],
    connectPath: "/api/google/auth",
    detailAnchor: "google-business",
    authModel: "OAUTH",
    availability: "active",
    platformRequirements: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    platformSetup: setup({
      summary: "The shared Avantiqo Google OAuth project authorizes customer Business Profiles.",
      callbackPaths: ["/api/google/auth/callback"],
      steps: [
        "Configure the Avantiqo Google OAuth client and callback origin.",
        "Enable the required Google Business Profile APIs.",
        "Obtain Google Business Profile partner/API access before customer location discovery is enabled.",
      ],
      optionalRequirements: ["GOOGLE_OAUTH_CALLBACK_ORIGIN"],
      approval: "Google Business Profile API access is subject to Google approval and quota assignment.",
    }),
    customerSetup: customerSetup("PROVIDER_AUTHORIZATION_AND_ASSET_PICKER", "Sign in with Google and choose the business location"),
  },
  {
    id: "google-ads",
    name: "Google Ads",
    category: "Advertising",
    description: "Connect the advertiser account used for paid campaigns.",
    connectionProviders: ["google_ads"],
    assetProviders: ["google_ads"],
    assetTypes: ["google_ads_customer"],
    connectPath: "/api/google-ads/auth",
    detailAnchor: "google-ads",
    authModel: "OAUTH",
    availability: "active",
    platformRequirements: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_ADS_DEVELOPER_TOKEN"],
    platformSetup: setup({
      summary: "The shared Avantiqo Google OAuth project and developer token serve customer Google Ads connections.",
      callbackPaths: ["/api/google-ads/auth/callback"],
      steps: [
        "Configure the shared Google OAuth client.",
        "Configure the Google Ads developer token and manager-account access.",
      ],
      optionalRequirements: ["GOOGLE_OAUTH_CALLBACK_ORIGIN"],
      approval: "Google Ads developer-token access level controls production capability.",
    }),
    customerSetup: customerSetup("PROVIDER_AUTHORIZATION_AND_ASSET_PICKER", "Sign in with Google and choose the advertiser account"),
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    category: "Messaging",
    description: "Connect the business WhatsApp channel for customer conversations and notifications.",
    connectionProviders: ["whatsapp"],
    assetProviders: ["whatsapp"],
    assetTypes: ["whatsapp_phone_number"],
    connectPath: "/api/whatsapp/auth",
    authModel: "EMBEDDED_SIGNUP",
    availability: "active",
    platformRequirements: ["META_APP_ID", "META_APP_SECRET", "META_WHATSAPP_CONFIG_ID", "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN"],
    platformSetup: setup({
      summary: "Avantiqo owns the Meta app and Embedded Signup configuration; customers only approve their WhatsApp Business account.",
      callbackPaths: ["/api/commercial/communications/webhooks/meta"],
      steps: [
        "Configure Meta WhatsApp Embedded Signup.",
        "Configure the shared WhatsApp webhook verification token.",
        "Complete Meta business/app review required for production onboarding.",
      ],
    }),
    customerSetup: customerSetup("EMBEDDED_SIGNUP", "Open WhatsApp Business setup and approve the business account"),
  },
  {
    id: "line",
    name: "LINE",
    category: "Messaging",
    description: "Connect the organization LINE Official Account for customer communication.",
    connectionProviders: ["line"],
    assetProviders: ["line"],
    assetTypes: ["line_official_account"],
    connectPath: "/api/line/module/auth",
    authModel: "MODULE_OAUTH",
    availability: "platform_setup_required",
    platformRequirements: ["LINE_MODULE_CHANNEL_ID", "LINE_MODULE_CHANNEL_SECRET", "LINE_MODULE_BOT_HEADER_NAME"],
    platformSetup: setup({
      summary: "Avantiqo should use one approved LINE Module Channel so customers attach their Official Account without sharing channel secrets.",
      callbackPaths: ["/api/line/module/auth/callback", "/api/commercial/communications/webhooks/line"],
      steps: [
        "Apply for LINE corporate Module Channel / Marketplace access.",
        "Configure the Avantiqo module channel and callback URL after approval.",
        "Configure the module bot-target header supplied by LINE after participation.",
      ],
      approval: "LINE Module Channel functions require corporate approval from LINE.",
    }),
    customerSetup: customerSetup("PROVIDER_AUTHORIZATION", "Sign in as a LINE Official Account admin and attach Avantiqo"),
  },
  {
    id: "email",
    name: "Email",
    category: "Communication",
    description: "Connect Google Workspace, Gmail, Microsoft 365, Outlook, iCloud, Yahoo or another business mailbox.",
    connectionProviders: ["email_google", "email_microsoft", "email_imap"],
    assetProviders: ["email_google", "email_microsoft", "email_imap"],
    assetTypes: ["business_mailbox"],
    connectPath: "/api/email/auth",
    authModel: "MAIL_ACCOUNT",
    availability: "active",
    platformRequirements: [],
    platformSetup: setup({
      summary: "Google and Microsoft OAuth are platform-managed; standard mailboxes can use secure IMAP/SMTP fallback.",
      callbackPaths: ["/api/email/google/auth/callback", "/api/email/microsoft/auth/callback"],
      steps: [
        "Configure Google mailbox OAuth for one-click Gmail/Workspace connection.",
        "Configure Microsoft mailbox OAuth for one-click Outlook/Microsoft 365 connection.",
      ],
      optionalRequirements: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    }),
    customerSetup: customerSetup("MAILBOX_CHOOSER", "Choose the mailbox provider and sign in"),
  },
  {
    id: "shopify",
    name: "Shopify",
    category: "Commerce",
    description: "Connect the online store for governed product, order, inventory, and location synchronization.",
    connectionProviders: ["shopify"],
    assetProviders: ["shopify"],
    assetTypes: ["shopify_store"],
    connectPath: "/api/shopify/auth",
    detailAnchor: "shopify",
    authModel: "OAUTH",
    availability: "active",
    platformRequirements: [ANY("SHOPIFY_CLIENT_ID", "SHOPIFY_API_KEY"), ANY("SHOPIFY_CLIENT_SECRET", "SHOPIFY_API_SECRET")],
    platformSetup: setup({
      summary: "One Avantiqo Shopify app authorizes customer stores; Avantiqo converts verified store events into canonical business documents.",
      callbackPaths: ["/api/shopify/auth/callback", "/api/commerce/shopify/webhooks"],
      steps: ["Configure the Avantiqo Shopify app, OAuth redirect URL and webhook destination."],
    }),
    customerSetup: customerSetup("STORE_APPROVAL_AND_ENTITY_MAPPING", "Approve the Shopify store and map it to the correct legal entity"),
  },
  {
    id: "tripadvisor",
    name: "Tripadvisor",
    category: "Reputation",
    description: "Find and select the business Tripadvisor location. Avantiqo manages the partner API connection and reads live reputation intelligence for the selected location.",
    connectionProviders: ["tripadvisor"],
    assetProviders: ["tripadvisor"],
    assetTypes: ["tripadvisor_location"],
    connectPath: "/api/tripadvisor/auth",
    authModel: "PARTNER_LOCATION_MAPPING",
    availability: "active",
    platformRequirements: ["TRIPADVISOR_API_KEY"],
    platformSetup: setup({
      summary: "Avantiqo manages one Tripadvisor Terra partner credential; customers only search and select their business location.",
      steps: ["Configure the Tripadvisor Terra API key and contracted access level."],
      approval: "Available endpoints and retention rights depend on Avantiqo's Tripadvisor partner agreement.",
    }),
    customerSetup: customerSetup("BUSINESS_SEARCH", "Search for the business and select the correct Tripadvisor location"),
  },
];

export function getBusinessConnection(id) {
  return BUSINESS_CONNECTION_REGISTRY.find((row) => row.id === id) || null;
}

export function listBusinessConnections() {
  return BUSINESS_CONNECTION_REGISTRY.map((row) => ({ ...row }));
}

function requirementReady(requirement) {
  if (typeof requirement === "string") {
    return Boolean(String(process.env[requirement] || "").trim());
  }
  const alternatives = Array.isArray(requirement?.anyOf) ? requirement.anyOf : [];
  return alternatives.length > 0 && alternatives.some((name) => String(process.env[name] || "").trim());
}

function requirementLabel(requirement) {
  if (typeof requirement === "string") return requirement;
  const alternatives = Array.isArray(requirement?.anyOf) ? requirement.anyOf : [];
  return alternatives.join(" OR ");
}

export function checkBusinessConnectionPlatformReadiness(connection) {
  const required = connection?.platformRequirements || [];
  const optional = connection?.platformSetup?.optionalRequirements || [];
  const missing = required.filter((item) => !requirementReady(item)).map(requirementLabel);
  const optionalMissing = optional
    .filter((item) => !requirementReady(item))
    .map(requirementLabel);

  return {
    ready: missing.length === 0 && connection?.availability !== "platform_setup_required",
    configured: missing.length === 0,
    missing,
    optionalMissing,
    authModel: connection?.authModel || null,
    availability: connection?.availability || "active",
  };
}
