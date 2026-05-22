import ThailandPayrollPack
from "./thailand";

import UAEPayrollPack
from "./uae";

const COUNTRY_PACKS = {

  Thailand:
    ThailandPayrollPack,

  UAE:
    UAEPayrollPack,

};

export default function loadPayrollCountryPack(
  country = "Thailand"
) {

  return (
    COUNTRY_PACKS[
      country
    ] || ThailandPayrollPack
  );

}
