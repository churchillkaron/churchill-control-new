import * as OrganizationServices
from "../repositories/OrganizationServiceRepository";


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


  return Object.values(categories);

}




export async function resolveOrganizationService({

  organization_id,

  service_id,

}) {

  const rows =
    await OrganizationServices.listByOrganization(
      organization_id
    );


  return (
    rows || []
  ).find(
    service =>
      service.service_id === service_id
  ) || null;

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
