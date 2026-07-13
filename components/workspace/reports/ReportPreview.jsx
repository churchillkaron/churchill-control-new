"use client";

function formatMoney(value, currency) {

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency:
        currency?.code ||
        "THB",
      maximumFractionDigits: 2,
    }
  )
  .format(
    Number(value || 0)
  );

}


export default function ReportPreview({
  document = null,
}) {

  if (!document) return null;


  return (

    <div
      className="
        mt-8
        flex
        w-full
        justify-center
        overflow-x-auto
        pb-10
      "
    >

      <div
        className="
          shrink-0
        "
      >

        <article
          className="
            h-[1123px]
            w-[794px]
            overflow-hidden
            rounded-sm
            bg-white
            px-14
            py-12
            text-black
            shadow-2xl
          "
        >


          <header
            className="
              border-b
              border-black/10
              pb-5
            "
          >

            <div
              className="
                text-lg
                font-semibold
              "
            >
              {
                document.organization?.name ||
                "Organization"
              }
            </div>


            <div
              className="
                mt-1
                text-xs
                text-black/50
              "
            >
              {
                document.organization?.address ||
                ""
              }
            </div>


            <div
              className="
                mt-6
                flex
                justify-between
              "
            >

              <div>

                <div
                  className="
                    text-sm
                    font-semibold
                  "
                >
                  {
                    document.title ||
                    "Financial Report"
                  }
                </div>

              </div>


              <div
                className="
                  text-right
                  text-xs
                  text-black/60
                "
              >

                <div>
                  Entity:
                  {" "}
                  {
                    document.entity?.name ||
                    "-"
                  }
                </div>


                <div>
                  Currency:
                  {" "}
                  {
                    document.currency?.code ||
                    "-"
                  }
                </div>


                <div>
                  Period:
                  {" "}
                  {
                    document.period?.name ||
                    "-"
                  }
                </div>


              </div>


            </div>


          </header>



          <main
            className="
              mt-8
              space-y-5
              text-xs
            "
          >

            {
              (document.sections || [])
              .map(section => (

                <section
                  key={section.title}
                >

                  <div
                    className="
                      border-b
                      border-black/20
                      pb-1
                      text-[11px]
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
                          flex
                          justify-between
                          border-b
                          border-black/[0.04]
                          py-1.5
                        "
                      >

                        <span>
                          {row.label}
                        </span>


                        <span>
                          {
                            formatMoney(
                              row.amount,
                              document.currency
                            )
                          }
                        </span>


                      </div>

                    ))
                  }


                  {
                    section.total !== undefined ? (

                      <div
                        className="
                          flex
                          justify-between
                          border-t
                          border-black/20
                          pt-2
                          font-semibold
                        "
                      >

                        <span>
                          Total
                        </span>

                        <span>
                          {
                            formatMoney(
                              section.total,
                              document.currency
                            )
                          }
                        </span>

                      </div>

                    ) : null
                  }


                </section>

              ))
            }


          </main>



          <footer
            className="
              mt-10
              border-t
              border-black/10
              pt-3
              text-[10px]
              text-black/40
            "
          >
            Generated by Avantiqo
          </footer>


        </article>


      </div>


    </div>

  );

}
