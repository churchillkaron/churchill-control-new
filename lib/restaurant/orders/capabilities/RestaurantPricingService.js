import {
  RestaurantTaxService,
} from "./RestaurantTaxService";

export class RestaurantPricingService {

  static calculate({

    subtotal,

    discount,

    taxRate,

    serviceChargeRate,

  }) {

    const serviceCharge =
      subtotal *
      (serviceChargeRate / 100);

    const taxable =
      subtotal +
      serviceCharge;

    const tax =
      RestaurantTaxService.calculate({

        taxableAmount:
          taxable,

        taxRate,

      });

    const vat =
      tax.tax;

    const total =
      taxable +
      vat -
      discount;

    return {

      subtotal,

      discount,

      serviceCharge,

      vat,

      total,

    };

  }

}
