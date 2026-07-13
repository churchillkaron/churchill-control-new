import {
  save as saveOrganizationService,
} from "../repositories/OrganizationServiceRepository";


import {
  SERVICE_CATALOG,
} from "@/lib/platform/registry/business-services/BusinessServiceRegistry";


export async function bootstrapOrganizationServices({

  organization_id,

  industry_id = "default",

  managed_by = "avantiqo",

}) {


  if (!organization_id) {

    throw new Error(
      "organization_id required"
    );

  }


  const created = [];


  for (
    const category
    of SERVICE_CATALOG
  ) {


    for (
      const service
      of category.services || []
    ) {


      if (!service.default_enabled) {

        continue;

      }


      const record =
        await saveOrganizationService({

          organization_id,

          service_category_id:
            category.id,

          service_id:
            service.id,

          package_id:
            service.package ||
            "core",

          status:
            "ACTIVE",

          managed_by,

          authorization_required:
            true,

          usage_enabled:
            true,

          billing_enabled:
            true,

          health:
            "UNKNOWN",

          activated_at:
            new Date()
              .toISOString(),

          metadata: {

            industry_id,

            description:
              service.description ||
              null,

          },

          fallback_enabled:
            false,

          billing_mode:
            "USAGE",

          pricing_mode:
            "PROVIDER",

          budget_limit:
            0,

          budget_used:
            0,

          hard_budget_limit:
            false,

          default_currency:
            "USD",

          configuration:
            {},

          total_requests:
            0,

          total_failures:
            0,

          total_cost:
            0,

        });


      created.push(
        record
      );

    }

  }


  return {

    success:true,

    services:
      created,

    count:
      created.length,

  };

}
