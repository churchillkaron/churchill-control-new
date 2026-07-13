export function mapBalanceSheetReport({

  result = {},

  organization = null,

  entity = null,

  period = null,

  currency = null,

}) {

  return {

    title:
      "Balance Sheet",


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

    },


    currency: {

      code:
        currency?.code ||
        null,

    },


    sections: [

      {

        title:
          "Assets",

        rows:[

          {
            label:
              "Total Assets",

            amount:
              result.totalAssets || 0,
          }

        ],

        total:
          result.totalAssets || 0,

      },


      {

        title:
          "Liabilities",

        rows:[

          {
            label:
              "Total Liabilities",

            amount:
              result.totalLiabilities || 0,
          }

        ],

        total:
          result.totalLiabilities || 0,

      },


      {

        title:
          "Equity",

        rows:[

          {
            label:
              "Total Equity",

            amount:
              result.totalEquity || 0,
          }

        ],

        total:
          result.totalEquity || 0,

      }

    ],


    summary:{

      totalAssets:
        result.totalAssets || 0,

      totalLiabilities:
        result.totalLiabilities || 0,

      totalEquity:
        result.totalEquity || 0,

    }

  };

}
