import { registerProviderCredentialResolver } from "../ProviderCredentialRuntime.js";

function text(value) {
  return String(value ?? "").trim();
}

registerProviderCredentialResolver("stripe", async ({ organization_id }) => {
  const apiKey = text(process.env.STRIPE_SECRET_KEY);
  if (!apiKey) return null;

  return {
    credential_id: "stripe:platform-managed",
    api_key: apiKey,
    webhook_secret: text(process.env.STRIPE_WEBHOOK_SECRET) || null,
    publishable_key:
      text(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) ||
      text(process.env.STRIPE_PUBLISHABLE_KEY) ||
      null,
    billing_portal_configuration_id:
      text(process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID) || null,
    managed_by: "AVANTIQO",
    credential_purpose: "PLATFORM_BILLING_AND_PAYMENTS",
    api_family: "STRIPE_API",
    organization_id,
  };
});
