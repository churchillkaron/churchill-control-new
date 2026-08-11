import {
  PROVIDER_REGISTRY,
} from "../ProviderRegistry.js";

const GOOGLE_BUSINESS_CAPABILITIES = [
  "documents.google.drive",
  "marketing.google.business.locations.read",
  "reputation.review.read",
  "reputation.review.reply",
  "marketing.google.business.publish",
  "marketing.google.business.media.publish",
];

if (PROVIDER_REGISTRY.google) {
  PROVIDER_REGISTRY.google.capabilities = [
    ...new Set(GOOGLE_BUSINESS_CAPABILITIES),
  ];
}

PROVIDER_REGISTRY.google_ads = {
  id: "google_ads",
  connectionModel: "managed",
  name: "Google Ads",
  category: "marketing",
  capabilities: [
    "marketing.google.ads.manage",
    "marketing.google.ads.spend",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "google_ads_managed",
  runtimeAvailable: true,
  active: true,
  metadata: {
    administrative_capability: "marketing.google.ads.manage",
    paid_media_capability: "marketing.google.ads.spend",
    paid_media_requires_supplier_verification: true,
    paid_media_requires_prepaid_reservation: true,
    paid_media_requires_explicit_authorization: true,
  },
};
