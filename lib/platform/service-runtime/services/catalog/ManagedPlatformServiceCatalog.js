export const MANAGED_PLATFORM_SERVICE_CATEGORIES = [
  {
    id: "marketing-social",
    name: "Marketing & Social",
    description:
      "Managed marketing channels, advertising, publishing and campaign execution.",
    services: [
      {
        id: "meta-ads",
        name: "Managed Meta Advertising",
        description:
          "Run Facebook and Instagram advertising through Avantiqo-managed billing and the organization's connected social identities.",
        requires: ["META_ADS"],
        execution_capabilities: ["marketing.ads.manage"],
        provider: "meta",
        default_enabled: true,
        package: "growth",
        managed_by: "avantiqo",
        authorization_required: true,
        usage_enabled: true,
        billing_enabled: true,
        billing_mode: "PREPAID_MANAGED_MEDIA",
        pricing_mode: "PROVIDER",
        connection_model: "MANAGED_PROVIDER_WITH_ORGANIZATION_CHANNEL",
      },
      {
        id: "google-ads",
        name: "Managed Google Advertising",
        description:
          "Run Google Ads through Avantiqo-managed service execution, organization authorization, wallet budget reservation, and provider spend reconciliation.",
        requires: ["GOOGLE_ADS"],
        execution_capabilities: ["marketing.google.ads.manage"],
        provider: "google_ads",
        default_enabled: false,
        package: "growth",
        managed_by: "avantiqo",
        authorization_required: true,
        usage_enabled: true,
        billing_enabled: true,
        billing_mode: "PREPAID_MANAGED_MEDIA",
        pricing_mode: "PROVIDER",
        connection_model: "MANAGED_PROVIDER_WITH_ORGANIZATION_CHANNEL",
      },
    ],
  },
];

export function getManagedPlatformService(serviceId) {
  for (const category of MANAGED_PLATFORM_SERVICE_CATEGORIES) {
    const service = (category.services || []).find(
      (item) => item.id === serviceId
    );

    if (service) {
      return {
        ...service,
        category_id: category.id,
        category_name: category.name,
      };
    }
  }

  return null;
}
