"use client";



export default function ReportRenderer({

  data = {},

  brand = {},

}) {


  const document =
    data.document ||
    data.data?.document ||
    data.data ||
    {};


  const sections =
    document.sections || [];



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

        <div
          key={block}
          className="flex justify-between"
        >

          <div>

            {
              brand.logo_url ? (

                <img

                  src={brand.logo_url}

                  alt="Logo"

                  className="
                    mb-4
                    h-16
                    object-contain
                  "

                />

              ) : null
            }


            <h1 className="text-3xl font-bold">

              {
                brand.name ||
                document.organization?.name ||
                "Company"
              }

            </h1>


            {
              brand.legal?.legal_name ? (

                <div className="mt-2 text-sm">

                  {brand.legal.legal_name}

                </div>

              ) : null
            }


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

            <div className="text-3xl font-bold">

              {
                document.title ||
                "Financial Report"
              }

            </div>


          </div>


        </div>

      );

    }



    if(block === "report_info"){

      return (

        <div

          key={block}

          className="
            mt-8
            border-t
            pt-6
            text-sm
          "

        >

          <div className="flex justify-between">

            <span>
              Entity
            </span>

            <span className="font-semibold">

              {
                document.entity?.name ||
                "-"
              }

            </span>

          </div>


          <div className="mt-2 flex justify-between">

            <span>
              Period
            </span>

            <span>

              {
                document.period?.name ||
                "-"
              }

            </span>

          </div>


          <div className="mt-2 flex justify-between">

            <span>
              Currency
            </span>

            <span>

              {
                document.currency?.code ||
                "-"
              }

            </span>

          </div>


        </div>

      );

    }



    if(block === "sections"){

      return (

        <div
          key={block}
          className="mt-10 space-y-8"
        >

          {
            sections.map(section => (

              <div key={section.title}>


                <div

                  className="
                    border-b
                    pb-2
                    text-sm
                    font-bold
                    uppercase
                  "

                >

                  {section.title}

                </div>


                {
                  (section.rows || [])
                  .map(row => (

                    <div

                      key={row.label}

                      className="
                        mt-2
                        flex
                        justify-between
                        text-sm
                      "

                    >

                      <span>
                        {row.label}
                      </span>


                      <span>

                        {
                          money(row.amount)
                        }

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
                        pt-3
                        font-semibold
                      "

                    >

                      <span>
                        Total
                      </span>


                      <span>

                        {
                          money(section.total)
                        }

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



    if(block === "footer"){

      return (

        <div

          key={block}

          className="
            mt-16
            border-t
            pt-4
            text-xs
            text-gray-500
          "

        >

          Generated by Avantiqo

        </div>

      );

    }


    return null;

  }



  const blocks = [

    "report_info",

    "sections",

    "footer",

  ];



  return (

    <div className="rounded-3xl bg-white p-10 text-black">

      {
        blocks
        .map(
          renderBlock
        )
      }

    </div>

  );

}
