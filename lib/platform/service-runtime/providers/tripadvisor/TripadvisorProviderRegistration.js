import { PROVIDER_REGISTRY } from "../ProviderRegistry.js";

PROVIDER_REGISTRY.tripadvisor = {
  id: "tripadvisor",
  connectionModel: "managed_partner_location_mapping",
  name: "Tripadvisor Terra",
  category: "reputation",
  capabilities: [
    "reputation.tripadvisor.locations.search",
    "reputation.tripadvisor.location.read",
    "reputation.tripadvisor.reviews.read",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "tripadvisor",
  runtimeAvailable: true,
  active: true,
  metadata: {
    managed_by: "AVANTIQO",
    customer_api_key_required: false,
    customer_provider_account_required: false,
    location_mapping_required: true,
    write_capabilities_enabled: false,
    attribution_required: true,
  },
};
