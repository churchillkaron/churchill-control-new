import {
  SERVICE_CATALOG,
} from "@/lib/platform/registry/business-services/BusinessServiceRegistry";

import {
  resolveExecutionCapabilities,
} from "./CapabilityExecutionResolver";

import {
  listByOrganization,
} from "@/lib/platform/service-runtime/usage/repositories/ServiceUsageRepository";


export async function resolveOrganizationServiceDomainDetails({

  organization_id,

  domain_id,

}) {


  const category =
    SERVICE_CATALOG.find(
      item =>
        item.id === domain_id
    );


  if (!category) {

    return [];

  }


  const usageRows =
    await listByOrganization(
      organization_id
    );


  return (category.services || [])
    .map(service => {


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


      return {

        id:
          service.id,

        name:
          service.name,

        description:
          service.description,

        package:
          service.package,

        status:
          service.default_enabled
            ? "ACTIVE"
            : "AVAILABLE",

        capabilities:
          service.requires || [],


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


      };

    });

}
