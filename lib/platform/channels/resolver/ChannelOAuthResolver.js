export function resolveChannelOAuthRoute({ runtime }) {
  const routes = {
    meta: "/api/meta/auth",
    google: "/api/google/auth",
    google_ads: "/api/google-ads/auth",
    whatsapp: "/api/whatsapp/auth",
    line: "/api/line/auth",
    shopify: "/api/shopify/auth",
    email: "/api/email/auth",
  };

  return routes[runtime] || null;
}
