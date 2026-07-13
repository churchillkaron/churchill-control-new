import {
  listByOrganization,
} from "@/lib/platform/service-runtime/usage/repositories/ServiceUsageRepository";


export async function resolveServiceEconomics({

  organization_id,

  domain,

  capability,

  execution_capability,

}) {


  const usage =
    await listByOrganization(
      organization_id
    );


  const filtered =
    usage.filter(row => {


      if (
        execution_capability &&
        row.capability !== execution_capability
      ) {
        return false;
      }


      if (
        capability &&
        row.business_capability &&
        row.business_capability !== capability
      ) {
        return false;
      }


      if (
        domain &&
        row.service_domain !== domain
      ) {
        return false;
      }


      return true;

    });


  return {

    usage:
      filtered.reduce(
        (sum,row)=>
          sum +
          Number(
            row.quantity || 0
          ),
        0
      ),


    cost:
      filtered.reduce(
        (sum,row)=>
          sum +
          Number(
            row.customer_price || 0
          ),
        0
      ),


    executions:
      filtered.length,

  };

}
