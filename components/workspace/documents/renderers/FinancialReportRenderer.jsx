"use client";


export default function FinancialReportRenderer({

  data = {},

  template = {},

  brand = {},

}) {


  const document =
    data.data || {};


  const party =
    data.party || {};


  console.log(
    {
      template,
      document,
      blocksSource:
        template?.layout?.layout?.blocks ||
        template?.template?.blocks ||
        template?.layout?.blocks ||
        "default",
    }
  );


  const blocks =
    template?.layout?.layout?.blocks ||
    template?.template?.blocks ||
    template?.layout?.blocks ||
    [
      "header",
      "report_info",
      "sections",
      "summary",
      "footer"
    ];


  const sections =
    document.sections || [];


  const summary =
    document.summary || {};


  function money(value){

    return new Intl.NumberFormat(
      "en-US",
      {
        style:"currency",
        currency:
          document.currency?.code ||
          "THB",
        maximumFractionDigits:2,
      }
    )
    .format(
      Number(value || 0)
    );

  }


  function renderBlock(block){

    if(block === "header"){

      return (

        <div key={block} className="flex justify-between">

          <div>


            {
              brand.logo_url ? (

                <img
                  src={brand.logo_url}
                  alt="Logo"
                  className="mb-4 h-16 object-contain"
                />

              ) : null
            }


            <h1 className="text-3xl font-bold">
              {brand.name || "Company Name"}
            </h1>


            <div className="mt-2 text-sm">
              {
                brand.legal?.legal_name ||
                ""
              }
            </div>


            {
              brand.legal?.tax_id ? (

                <div className="mt-1 text-sm">
                  Tax ID:
                  {" "}
                  {brand.legal.tax_id}
                </div>

              ) : null
            }


          </div>


          <div className="text-right">

            <div className="text-4xl font-bold">
              INVOICE
            </div>

          </div>

        </div>

      );

    }



    if(block === "report_info"){

      return (

        <div
          key={block}
          className="mt-8 flex justify-end border-t pt-6"
        >

          <div className="w-64 text-sm">

            <div className="flex justify-between">

              <span>
                Entity:
              </span>

              <span className="font-semibold">
                {document.entity?.name || "-"}
              </span>

            </div>


            <div className="mt-2 flex justify-between">

              <span>
                Period:
              </span>

              <span>
                {document.period?.name || "-"}
              </span>

            </div>


            <div className="mt-2 flex justify-between">

              <span>
                Currency:
              </span>

              <span>
                {document.currency?.code || "-"}
              </span>

            </div>


          </div>

        </div>

      );

    }



    if(block === "sections"){

      return (

        <div
          key={block}
          className="mt-10"
        >

          {
            sections.map(section => (

              <div
                key={section.title}
                className="mb-8"
              >

                <div className="border-b pb-2 font-semibold">

                  {section.title}

                </div>


                {
                  (section.rows || [])
                  .map(row => (

                    <div
                      key={row.label}
                      className="mt-2 flex justify-between text-sm"
                    >

                      <span>
                        {row.label}
                      </span>


                      <span>
                        {money(row.amount)}
                      </span>


                    </div>

                  ))
                }


                {
                  section.total !== undefined ? (

                    <div
                      className="
                        mt-3
                        flex
                        justify-between
                        border-t
                        pt-2
                        font-semibold
                      "
                    >

                      <span>
                        Total
                      </span>

                      <span>
                        {money(section.total)}
                      </span>

                    </div>

                  ) : null
                }


              </div>

            ))
          }

        </div>

      );

    }



    if(block === "summary"){

      return (

        <div
          key={block}
          className="mt-8 border-t pt-5 text-right"
        >

          <div className="text-2xl font-bold">

            Net Profit:
            {" "}
            {money(summary.netProfit)}

          </div>

        </div>

      );

    }



    if(block === "footer"){

      return (

        <div
          key={block}
          className="mt-12 border-t pt-5 text-sm text-gray-500 grid grid-cols-2 gap-8"
        >

          <div>

            <div className="font-semibold mb-2">
              Company
            </div>

            {
              brand.legal?.address ? (
                <div>
                  {brand.legal.address}
                </div>
              ) : null
            }

            {
              brand.legal?.email ? (
                <div>
                  {brand.legal.email}
                </div>
              ) : null
            }

            {
              brand.website ? (
                <div>
                  {brand.website}
                </div>
              ) : null
            }

          </div>


          <div>

            {
              brand.payment?.bank_name ? (

                <>
                  <div className="font-semibold mb-2">
                    Payment Details
                  </div>

                  <div>
                    Bank: {brand.payment.bank_name}
                  </div>

                  <div>
                    Account Name: {brand.payment.account_name}
                  </div>

                  <div>
                    Account No: {brand.payment.account_number}
                  </div>
                </>

              ) : null
            }

          </div>


        </div>

      );

    }


    return null;

  }


  return (

    <div className="rounded-3xl bg-white p-10 text-black">

      {blocks.map(renderBlock)}

    </div>

  );

}
