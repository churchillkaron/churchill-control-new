import {
  SERVICE_CATALOG,
} from "@/lib/platform/registry/business-services/BusinessServiceRegistry";

import {
  resolveOrganizationServices,
} from "./OrganizationServiceResolver";

import {
  listByOrganization,
} from "@/lib/platform/service-runtime/usage/repositories/ServiceUsageRepository";

import {
  resolveExecutionCapabilities,
} from "./CapabilityExecutionResolver";


function findEnabledService(
  organizationServices,
  serviceId
){

  return organizationServices.find(
    item =>
      item.service_id === serviceId
  );

}


export async function resolveOrganizationServiceDomains({

  organization_id,

}) {


  const organizationServices =
    await resolveOrganizationServices({

      organization_id,

    });


  const usageRows =
    await listByOrganization(
      organization_id
    );


  const enabled = [];


  for (
    const category
    of SERVICE_CATALOG
  ) {


    const domain = {

      id:
        category.id,

      name:
        category.name,

      description:
        category.description,

      services: [],

      capabilities: 0,

      usage:0,

      cost:0,

      status:"AVAILABLE",

    };


    for (
      const service
      of category.services || []
    ) {


      const organizationService =
        findEnabledService(
          organizationServices.flatMap(
            group =>
              group.services || []
          ),
          service.id
        );


      const serviceUsage =
        usageRows.filter(
          row =>
            (service.requires || [])
              .includes(
                String(
                  row.capability
                )
                .toUpperCase()
              )
            ||
            row.capability === service.id
        );


      domain.services.push({

        id:
          service.id,

        name:
          service.name,

        description:
          service.description,

        package:
          service.package,

        enabled:
          Boolean(
            organizationService ||
            service.default_enabled
          ),

        status:
          organizationService?.status ||
          (
            service.default_enabled
              ? "ACTIVE"
              : "AVAILABLE"
          ),

        capabilities:
          (service.requires || []).map(
            capability => ({

              business:
                capability,

              execution:
                resolveExecutionCapabilities([
                  capability
                ]),

            })
          ),

        usage:
          serviceUsage.reduce(
            (sum,row)=>
              sum +
              Number(
                row.quantity || 0
              ),
            0
          ),

        cost:
          serviceUsage.reduce(
            (sum,row)=>
              sum +
              Number(
                row.customer_price || 0
              ),
            0
          ),

      });


      domain.capabilities +=
        (service.requires || []).length;


      domain.usage +=
        serviceUsage.reduce(
          (sum,row)=>
            sum +
            Number(
              row.quantity || 0
            ),
          0
        );


      domain.cost +=
        serviceUsage.reduce(
          (sum,row)=>
            sum +
            Number(
              row.customer_price || 0
            ),
          0
        );


    }


    if (
      domain.services.length
    ) {

      enabled.push(domain);

    }

  }


  return enabled;

}
