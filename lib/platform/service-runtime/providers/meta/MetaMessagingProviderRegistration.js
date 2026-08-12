import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const shared = {
  connectionModel: "oauth",
  category: "communication",
  countries: ["*"],
  currencies: ["*"],
  runtime: "meta",
  runtimeAvailable: true,
  active: true,
};

PROVIDER_REGISTRY.facebook_messenger = {
  ...shared,
  id: "facebook_messenger",
  name: "Facebook Messenger",
  capabilities: ["communication.facebook.messenger.send"],
};

PROVIDER_REGISTRY.instagram_messaging = {
  ...shared,
  id: "instagram_messaging",
  name: "Instagram Messaging",
  capabilities: ["communication.instagram.send"],
};
