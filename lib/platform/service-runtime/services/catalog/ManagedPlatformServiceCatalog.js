export const MANAGED_PLATFORM_SERVICE_CATEGORIES = [
  {
    id: "communications",
    name: "Communications",
    description:
      "Managed business calling, messaging transport and communication channels operated through Avantiqo.",
    services: [
      {
        id: "secretary-telephony",
        name: "Secretary Phone Line",
        description:
          "Choose and connect a business phone number for Avantiqo Secretary. Avantiqo manages SIP/PSTN transport, routing, wallet control and provider credentials; the organization only manages its phone line and Secretary behavior.",
        requires: ["SECRETARY_TELEPHONY"],
        execution_capabilities: [
          "secretary.telephony.numbers.search",
          "secretary.telephony.number.connect",
          "secretary.telephony.number.sync",
        ],
        provider: "telnyx",
        default_enabled: false,
        package: "assistant",
        managed_by: "avantiqo",
        authorization_required: false,
        usage_enabled: true,
        billing_enabled: true,
        billing_mode: "PREPAID_MANAGED_TELEPHONY",
        pricing_mode: "PROVIDER_WITH_PLATFORM_MARKUP",
        connection_model: "AVANTIQO_MANAGED_PHONE_NUMBER",
        customer_carrier_account_required: false,
        customer_sip_credentials_required: false,
        external_secretary_authority_used: false,
      },
    ],
  },
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
          "Run Google Ads through an Avantiqo-managed advertiser account with prepaid wallet control, Avantiqo provider payment, and provider spend reconciliation.",
        requires: ["GOOGLE_ADS"],
        execution_capabilities: ["marketing.google.ads.manage"],
        provider: "google_ads",
        default_enabled: false,
        package: "growth",
        managed_by: "avantiqo",
        authorization_required: false,
        usage_enabled: true,
        billing_enabled: true,
        billing_mode: "PREPAID_MANAGED_MEDIA",
        pricing_mode: "PROVIDER",
        connection_model: "AVANTIQO_MANAGED_ADVERTISER",
      },
    ],
  },
  {
    id: "reputation",
    name: "Reputation",
    description:
      "Managed reputation and business-location intelligence through Avantiqo partner integrations.",
    services: [
      {
        id: "tripadvisor",
        name: "Tripadvisor",
        description:
          "Search and connect the organization's Tripadvisor location, then read live location and review intelligence through Avantiqo's managed Terra connection.",
        requires: ["TRIPADVISOR"],
        execution_capabilities: [
          "reputation.tripadvisor.locations.search",
          "reputation.tripadvisor.location.read",
          "reputation.tripadvisor.reviews.read",
        ],
        provider: "tripadvisor",
        default_enabled: false,
        package: "growth",
        managed_by: "avantiqo",
        authorization_required: false,
        usage_enabled: true,
        billing_enabled: true,
        billing_mode: "USAGE",
        pricing_mode: "PROVIDER",
        connection_model: "AVANTIQO_MANAGED_PARTNER_LOCATION_MAPPING",
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
