export function mapProfitLossReport({

  result = {},

  organization = null,

  entity = null,

  period = null,

  currency = null,

}) {


  return {

    title:
      "Profit & Loss Statement",


    organization:{

      id:
        organization?.id ||
        null,

      name:
        organization?.name ||
        organization?.legal_name ||
        "",

      address:
        organization?.address ||
        "",

      logo:
        organization?.logo ||
        null,

      tax_number:
        organization?.tax_number ||
        null,

    },


    entity:{

      id:
        entity?.id ||
        null,

      name:
        entity?.name ||
        entity?.legal_name ||
        "",

    },


    period:{

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


    currency:{

      code:
        currency?.code ||
        null,

      symbol:
        currency?.symbol ||
        null,

    },


    sections:[

      {

        title:"Revenue",

        rows:[
          {
            label:"Revenue",
            amount:
              result.revenue || 0,
          }
        ],

        total:
          result.revenue || 0,

      },


      {

        title:"Cost of Goods Sold",

        rows:[
          {
            label:"COGS",
            amount:
              result.cogs || 0,
          }
        ],

        total:
          result.cogs || 0,

      },


      {

        title:"Operating Expenses",

        rows:[
          {
            label:"Expenses",
            amount:
              result.expenses || 0,
          }
        ],

        total:
          result.expenses || 0,

      },


      {

        title:"Profit",

        rows:[
          {
            label:"Gross Profit",
            amount:
              result.grossProfit || 0,
          },
          {
            label:"Net Profit",
            amount:
              result.netProfit || 0,
          }
        ],

        total:
          result.netProfit || 0,

      }

    ],


    summary:{

      revenue:
        result.revenue || 0,

      cogs:
        result.cogs || 0,

      grossProfit:
        result.grossProfit || 0,

      expenses:
        result.expenses || 0,

      netProfit:
        result.netProfit || 0,

    }

  };

}
