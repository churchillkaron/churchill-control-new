import {
  SERVICE_CATALOG,
} from "@/lib/platform/registry/business-services/BusinessServiceRegistry";


export function resolveServiceCapabilities(
  serviceId
){

  for (
    const category
    of SERVICE_CATALOG
  ){

    const service =
      (category.services || [])
        .find(
          item =>
            item.id === serviceId
        );


    if(service){

      return {

        service_id:
          service.id,

        name:
          service.name,

        package:
          service.package,

        capabilities:
          service.requires || [],

      };

    }

  }


  return null;

}



export function resolveOrganizationCapabilities(
  services = []
){

  return services.flatMap(
    service => {

      const resolved =
        resolveServiceCapabilities(
          service.service_id
        );


      if(!resolved){
        return [];
      }


      return [
        {

          ...resolved,

          status:
            service.status,

          organization_service_id:
            service.id,

        }
      ];

    }
  );

}
