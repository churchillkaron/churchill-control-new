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
  connectionModel: "oauth",
  name: "Google Ads",
  category: "marketing",
  capabilities: [
    "marketing.google.ads.manage",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "google",
  runtimeAvailable: true,
  active: true,
};
