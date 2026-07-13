export async function buildFinancialReportDocument({

  data = {},

  context = {},

}) {


  const report =
    data.document ||
    data ||
    {};


  return {

    ...report,


    organization:
      report.organization ||
      context.organization ||
      null,


    entity:
      report.entity ||
      context.entity ||
      null,


    period:
      report.period ||
      context.period ||
      null,


    currency:
      report.currency ||
      {
        code:
          context.currency ||
          null,
      },


    sections:
      report.sections ||
      [],


    summary:
      report.summary ||
      {},

  };

}
