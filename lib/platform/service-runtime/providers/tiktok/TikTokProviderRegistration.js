import { PROVIDER_REGISTRY } from "../ProviderRegistry.js";

PROVIDER_REGISTRY.tiktok = {
  id: "tiktok",
  connectionModel: "oauth",
  name: "TikTok",
  category: "marketing",
  capabilities: [
    "marketing.tiktok.creator.read",
    "marketing.tiktok.publish",
    "marketing.tiktok.status",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "tiktok",
  runtimeAvailable: true,
  active