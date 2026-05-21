import { businessProfiles }
from "@/lib/business/config/businessProfiles";

export function getBusinessProfile(

  selectedBusiness

) {

  const businessKey =

    selectedBusiness?.page_name ||

    selectedBusiness?.name ||

    "default";

  return (

    businessProfiles[
      businessKey
    ] ||

    businessProfiles.default ||

    null

  );

}