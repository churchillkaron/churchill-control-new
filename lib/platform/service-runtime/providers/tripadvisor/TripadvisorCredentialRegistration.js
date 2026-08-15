import { registerProviderCredentialResolver } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";

function text(value) {
  return String(value ?? "").trim();
}

registerProviderCredentialResolver(
  "tripadvisor",
  async () => {
    const apiKey = text(process.env.TRIPADVISOR_API_KEY);
    if (!apiKey) return null;

    return {
      credential_id: null,
      api_key: apiKey,
      managed_by: "AVANTIQO",
      credential_purpose: "AVANTIQO_MANAGED_TRIPADVISOR_TERRA",
      api_family: "TRIPADVISOR_TERRA",
    };
  },
);
