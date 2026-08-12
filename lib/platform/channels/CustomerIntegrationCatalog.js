import { listChannels } from "@/lib/platform/channels/ChannelRegistry";

const CUSTOMER_UI = {
  facebook: { mergeId: "meta", name: "Facebook & Instagram", category: "Social media", description: "Connect the business Facebook Page and Instagram account Avantiqo should manage.", connectionProviders: ["meta"], connectPath: "/api/meta/auth", detailAnchor: null, availability: "active" },
  instagram: { mergeId: "meta", name: "Facebook & Instagram", category: "Social media", description: "Connect the business Facebook Page and Instagram account Avantiqo should manage.", connectionProviders: ["meta"], connectPath: "/api/meta/auth", detailAnchor: null, availability: "active" },
  "google-business": { mergeId: "google-business", name: "Google Business Profile", category: "Business presence", description: "Connect locations, reviews and business profile publishing.", connectionProviders: ["google"], assetProviders: ["google"], connectPath: "/api/google/auth", detailAnchor: "google-business", availability: "active" },
  "google-ads": { mergeId: "google-ads", name: "Google Ads", category: "Advertising", description: "Connect or activate the advertiser account used for paid campaigns.", connectionProviders: ["google_ads"], assetProviders: ["google_ads"], assetTypes: ["google_ads_customer"], connectPath: null, detailAnchor: "google-ads", availability: "active" },
  "whatsapp-business": { mergeId: "whatsapp", name: "WhatsApp Business", category: "Messaging", description: "Connect the business WhatsApp channel for customer conversations and notifications.", connectionProviders: ["whatsapp"], assetProviders: ["whatsapp"], assetTypes: ["whatsapp_phone_number"], connectPath: "/api/whatsapp/auth", detailAnchor: null, availability: "active" },
  "line-business": { mergeId: "line", name: "LINE", category: "Messaging", description: "Connect the organization LINE account for customer communication.", connectionProviders: ["line"], connectPath: null, detailAnchor: null, availability: "planned" },
  shopify: { mergeId: "shopify", name: "Shopify", category: "Commerce", description: "Connect the online store for product and order synchronization.", connectionProviders: ["shopify"], connectPath: null, detailAnchor: null, availability: "planned" },
};

const SUPPLEMENTAL = [{ id: "email", name: "Email", category: "Communication", description: "Connect a business mailbox for customer communication and automated workflows.", connectionProviders: ["email"], connectPath: null, detailAnchor: null, availability: "planned" }];

export function listCustomerIntegrations() {
  const rows = [];
  const seen = new Set();
  for (const channel of listChannels()) {
    const ui = CUSTOMER_UI[channel.id];
    if (!ui || seen.has(ui.mergeId)) continue;
    seen.add(ui.mergeId);
    rows.push({ id: ui.mergeId, name: ui.name, category: ui.category, description: ui.description, connectionProviders: ui.connectionProviders || [], assetProviders: ui.assetProviders || [], assetTypes: ui.assetTypes || [], connectPath: ui.connectPath || null, detailAnchor: ui.detailAnchor || null, availability: ui.availability || "planned" });
  }
  for (const integration of SUPPLEMENTAL) {
    if (!seen.has(integration.id)) rows.push(integration);
  }
  return rows;
}
