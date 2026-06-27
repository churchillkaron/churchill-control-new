export class RestaurantTaxService {

  static calculate({

    taxableAmount,

    taxRate,

  }) {

    return {

      taxableAmount,

      taxRate,

      tax:

        taxableAmount *

        (taxRate / 100),

    };

  }

}
