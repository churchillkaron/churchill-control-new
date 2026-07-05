import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  SERVICE_CATALOG,
} from "../../../registry/business-services/BusinessServiceRegistry";

import {
  getProvidersForService,
} from "../../../registry/providers/ProviderRegistry";
import { upsertOrganizationServiceProvider } from "../providers/OrganizationServiceProviderRepository";

const INDUSTRY_PRESETS = {
  restaurant: [
    "image-ai",
    "text-ai",
    "translation",
    "ocr",
    "whatsapp",
    "line",
    "facebook",
    "instagram",
    "google-business",
    "email",
    "sms",
    "card-payments",
    "business-files",
    "webhooks",
  ],
  hotel: [
    "image-ai",
    "text-ai",
    "translation",
    "ocr",
    "whatsapp",
    "line",
    "facebook",
    "instagram",
    "google-business",
    "email",
    "booking-platforms",
    "google-hotels",
    "business-files",
    "webhooks",
  ],
  default: [
    "image-ai",
    "text-ai",
    "translation",
    "ocr",
    "email",
    "business-files",
    "webhooks",
  ],
};

function getBootstrapServices(industry_id) {
  const enabledSet = new Set(
    INDUSTRY_PRESETS[industry_id] || INDUSTRY_PRESETS.default
  );

  return SERVICE_CATALOG.flatMap((category) =>
    category.services
      .filter((service) => enabledSet.has(service.id))
      .map((service) => ({
        category,
        service,
      }))
  );
}

export async function bootstrapOrganizationServices({
  organization_id,
  industry_id = "default",
  managed_by = "avantiqo",
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const serviceItems = getBootstrapServices(industry_id);
  const results = [];

  for (const item of serviceItems) {
    const payload = {
      organization_id,
      service_category_id: item.category.id,
      service_id: item.service.id,
      name: item.service.name,
      enabled: true,
      status: "enabled",
      health: "unknown",
      package_id: item.service.package || "core",
      usage_enabled: true,
      managed_by,
      metadata: {
        description: item.service.description,
        requires: item.service.requires || [],
      },
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("organization_services")
      .upsert(payload, {
        onConflict: "organization_id,service_id",
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    results.push(data);

    for (const provider of getProvidersForService(item.service)) {
      await upsertOrganizationServiceProvider({
        organization_id,
        organization_service_id: data.id,
        provider_id: provider.id,
        provider_status:
          provider.auth_type === "platform_managed"
            ? "connected"
            : "not_connected",
        authorization_status:
          provider.auth_type === "platform_managed"
            ? "authorized"
            : "not_authorized",
        configuration: {},
        health:
          provider.auth_type === "platform_managed"
            ? "healthy"
            : "unknown",
      });
    }
  }

  return {
    organization_id,
    industry_id,
    created_or_updated: results.length,
    services: results,
  };
}
