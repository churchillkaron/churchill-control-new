export function mapCashflowReport({

  result = {},

  organization = null,

  entity = null,

  period = null,

  currency = null,

}) {

  return {

    title:
      "Cash Flow",


    organization: {

      id:
        organization?.id ||
        null,

      name:
        organization?.name ||
        organization?.legal_name ||
        "",

    },


    entity: {

      id:
        entity?.id ||
        null,

      name:
        entity?.name ||
        entity?.legal_name ||
        "",

    },


    period: {

      id:
        period?.id ||
        null,

      name:
        period?.name ||
        "",

      from:
        period?.from ||
        null,

      to:
        period?.to ||
        null,

    },


    currency: {

      code:
        currency?.code ||
        null,

      symbol:
        currency?.symbol ||
        null,

    },


    sections: [

      {

        title:
          "Inflows",

        rows: [

          {
            label:
              "Cash Inflow",

            amount:
              result.inflow || 0,
          }

        ],

        total:
          result.inflow || 0,

      },


      {

        title:
          "Outflows",

        rows: [

          {
            label:
              "Cash Outflow",

            amount:
              result.outflow || 0,
          }

        ],

        total:
          result.outflow || 0,

      },


      {

        title:
          "Net Cash Flow",

        rows: [

          {
            label:
              "Net Cash Flow",

            amount:
              result.netCashflow || 0,
          }

        ],

        total:
          result.netCashflow || 0,

      }

    ],


    summary: {

      netCashflow:
        result.netCashflow || 0,

    },


  };

}
