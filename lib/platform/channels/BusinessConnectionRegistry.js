const ANY = (...names) => ({ anyOf: names });

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
    platformRequirements: ["META_APP_ID", "META_APP_SECRET", "META_WHATSAPP_CONFIG_ID"],
  },
  {
    id: "line",
    name: "LINE",
    category: "Messaging",
    description: "Connect the organization LINE Official Account for customer communication.",
    connectionProviders: ["line"],
    assetProviders: ["line"],
    assetTypes: ["line_official_account"],
    connectPath: "/api/line/auth",
    authModel: "MESSAGING_API",
    availability: "active",
    platformRequirements: [],
  },
  {
    id: "email",
    name: "Email",
    category: "Communication",
    description: "Connect Google Workspace, Gmail, Microsoft 365, Outlook, iCloud, Yahoo or another IMAP/SMTP mailbox.",
    connectionProviders: ["email_google", "email_microsoft", "email_imap"],
    assetProviders: ["email_google", "email_microsoft", "email_imap"],
    assetTypes: ["business_mailbox"],
    connectPath: "/api/email/auth",
    authModel: "MAIL_ACCOUNT",
    availability: "active",
    platformRequirements: [],
  },
  {
    id: "shopify",
    name: "Shopify",
    category: "Commerce",
    description: "Connect the online store for product and order synchronization.",
    connectionProviders: ["shopify"],
    assetProviders: ["shopify"],
    assetTypes: ["shopify_store"],
    connectPath: "/api/shopify/auth",
    authModel: "OAUTH",
    availability: "active",
    platformRequirements: [ANY("SHOPIFY_CLIENT_ID", "SHOPIFY_API_KEY"), ANY("SHOPIFY_CLIENT_SECRET", "SHOPIFY_API_SECRET")],
  },
  {
    id: "tripadvisor",
    name: "Tripadvisor",
    category: "Reputation",
    description: "Connect the Tripadvisor business location for reputation and review intelligence.",
    connectionProviders: ["tripadvisor"],
    assetProviders: ["tripadvisor"],
    assetTypes: ["tripadvisor_location"],
    connectPath: "/api/tripadvisor/auth",
    authModel: "PARTNER_LOCATION_MAPPING",
    availability: "runtime_pending",
    platformRequirements: ["TRIPADVISOR_API_KEY"],
  },
];

export function getBusinessConnection(id) {
  return BUSINESS_CONNECTION_REGISTRY.find((row) => row.id === id) || null;
}

export function listBusinessConnections() {
  return BUSINESS_CONNECTION_REGISTRY.map((row) => ({ ...row }));
}

export function checkBusinessConnectionPlatformReadiness(connection) {
  const missing = [];
  for (const requirement of connection?.platformRequirements || []) {
    if (typeof requirement === "string") {
      if (!String(process.env[requirement] || "").trim()) missing.push(requirement);
      continue;
    }
    const alternatives = Array.isArray(requirement?.anyOf) ? requirement.anyOf : [];
    if (alternatives.length && !alternatives.some((name) => String(process.env[name] || "").trim())) {
      missing.push(alternatives.join(" OR "));
    }
  }
  return {
    ready: missing.length === 0,
    missing,
    authModel: connection?.authModel || null,
  };
}
