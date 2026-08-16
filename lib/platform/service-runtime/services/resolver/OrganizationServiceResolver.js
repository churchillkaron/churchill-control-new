import * as OrganizationServices
from "../repositories/OrganizationServiceRepository";

import {
  PLATFORM_AI_SERVICES,
} from "@/lib/platform/service-runtime/ai/PlatformAIServiceCatalog";

// Every Avantiqo AI service is available to every organization.
//
// Entitlement used to be a row in organization_services and nothing else, so what an organization could
// do depended on which rows somebody had created. Across twenty-three organizations that produced
// thirty-one active services for one, ten for another, and two to six for nineteen of them. Churchill
// carried an ai.video.generate row that was ACTIVE with billing enabled and usage_enabled false, so one
// boolean was the entire reason it could not generate video. None of that was a decision anyone made
// about those customers.
//
// It also contradicted the billing model. Bea pays every provider and each organization's prepaid wallet
// is charged per use, which makes availability a property of the platform and spending a property of the
// organization. The wallet already enforces the second correctly: with no balance an organization cannot
// reserve, so it cannot spend. Gating availability as well meant a paying customer could be unable to use
// a service Bea was already paying for.
//
// Business services are deliberately excluded. email, line, x, the ad platforms and the rest need the
// organization's own account or an OAuth grant, so their availability follows that connection rather than
// this entitlement -- an unconnected Instagram is the customer's account, not an Avantiqo service.
const PLATFORM_AI_CATEGORY_ID = "platform-ai";

function platformAiEntitlements() {
  return (PLATFORM_AI_SERVICES || [])
    .map((service) => {
      const serviceId = String(
        service?.service_id || service?.id || "",
      ).trim();
      if (!serviceId) return null;
      return {
        // No id. On a real row this is the organization_services primary key, and a platform entitlement
        // has no row, so there is nothing truthful to put here. The first version invented
        // `platform-ai:${serviceId}`, which reads exactly like a service identifier -- the raw capability
        // list travels in the director's context alongside the allowed pairs, so a plan came back naming
        // its service as "platform-ai:ai.video.upscale" and the decision gate refused it as not enabled.
        // An invented identifier that looks like a real one is worse than an absent one.
        id: null,
        service_id: serviceId,
        package_id: service?.package || null,
        status: "ACTIVE",
        enabled: true,
        usage_enabled: true,
        billing_enabled: true,
        entitlement: "PLATFORM_STANDARD",
      };
    })
    .filter(Boolean);
}


export async function resolveOrganizationServices({
  organization_id,
}) {

  const rows =
    await OrganizationServices.listByOrganization(
      organization_id
    );


  const categories = {};


  for (
    const service
    of rows || []
  ) {


    const categoryId =
      service.service_category_id ||
      "services";


    if (!categories[categoryId]) {

      categories[categoryId] = {

        id:
          categoryId,

        name:
          categoryId
            .replace(/-/g," ")
            .replace(/\b\w/g,c=>c.toUpperCase()),

        services:[],

      };

    }


    categories[categoryId]
      .services
      .push({

        id:
          service.id,

        service_id:
          service.service_id,

        package_id:
          service.package_id,

        status:
          service.status,

        enabled:
          service.status === "ACTIVE",

        usage_enabled:
          service.usage_enabled,

        billing_enabled:
          service.billing_enabled,

      });

  }


  // The platform standard is applied after the organization's own rows and wins where they disagree,
  // because a per-organization flag on a platform service is exactly what this corrects. Suspending a
  // service for non-payment is the wallet's job and the wallet already does it.
  const platform = platformAiEntitlements();
  if (platform.length) {
    const standard = new Set(
      platform.map((service) => service.service_id),
    );

    for (const category of Object.values(categories)) {
      category.services = category.services.filter(
        (service) => !standard.has(service.service_id),
      );
    }

    categories[PLATFORM_AI_CATEGORY_ID] = {
      id: PLATFORM_AI_CATEGORY_ID,
      name: "Platform AI",
      services: platform,
    };
  }

  return Object.values(categories).filter(
    (category) => (category.services || []).length,
  );

}




export async function resolveOrganizationService({

  organization_id,

  service_id,

}) {

  return OrganizationServices.getByService({
    organization_id,
    service_id,
  });

}


export async function resolveOrganizationServiceReadModel({
  organization_id,
}) {


  const categories =
    await resolveOrganizationServices({
      organization_id,
    });


  return categories.flatMap(
    category =>
      (category.services || [])
        .map(service => ({

          id:
            service.id,

          name:
            service.service_id,

          category:
            category.name,

          category_id:
            category.id,

          status:
            service.status,

          package:
            service.package_id,

        }))
  );

}
