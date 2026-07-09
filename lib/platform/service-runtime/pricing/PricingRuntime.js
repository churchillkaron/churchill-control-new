import {
  getProviderPricing,
} from "./repositories/ProviderPricingRepository";


function calculateMarkup({

  cost,

  markup_percent = 0,

}) {

  return Number(

    (
      Number(cost) *

      (
        1 +
        (
          Number(markup_percent) /
          100
        )
      )

    )
    .toFixed(6)

  );

}



function calculateSupplierCost({

  pricing,

  usage = {},

}) {


  const inputTokens =
    Number(
      usage.input_tokens || 0
    );


  const outputTokens =
    Number(
      usage.output_tokens || 0
    );


  const quantity =
    Number(
      usage.quantity || 1
    );


  let cost = 0;



  /*
    Token based pricing
  */

  if (

    pricing.input_cost_per_1m ||
    pricing.output_cost_per_1m

  ) {


    cost +=

      (
        inputTokens *
        Number(
          pricing.input_cost_per_1m || 0
        )
      )
      /
      1000000;



    cost +=

      (
        outputTokens *
        Number(
          pricing.output_cost_per_1m || 0
        )
      )
      /
      1000000;


  }



  /*
    Unit based pricing

    OCR pages,
    messages,
    images,
    API calls
  */

  if (
    pricing.cost_per_unit
  ) {

    cost +=

      Number(
        pricing.cost_per_unit
      )
      *
      quantity;

  }



  return Number(
    cost.toFixed(6)
  );

}



export const PricingRuntime = {


  async resolve({

    provider,

    capability = null,

    model = null,

    country = null,

    currency = null,

    usage = {},

  }) {



    const pricing =
      await getProviderPricing({

        provider,

        capability,

        model,

        country,

        currency,

      });



    if (!pricing) {

      throw new Error(
        `No pricing configured for ${provider}`
      );

    }



    const supplierCost =
      calculateSupplierCost({

        pricing,

        usage,

      });



    const customerPrice =
      calculateMarkup({

        cost:
          supplierCost,

        markup_percent:
          pricing.markup_percent,

      });



    return {

      provider,

      capability,

      model:
        pricing.model || model || null,


      supplier_cost:
        supplierCost,


      platform_markup:
        Number(
          pricing.markup_percent || 0
        ),


      customer_price:
        customerPrice,


      currency:
        pricing.currency ||
        currency ||
        "USD",


      unit:
        pricing.unit ||
        null,


      pricing_id:
        pricing.id,

    };

  },

};
