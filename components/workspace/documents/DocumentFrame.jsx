"use client";

export default function DocumentFrame({

  brand = {},

  title = "",

  children,

}) {

  return (

    <div className="rounded-3xl bg-white p-10 text-black">


      <div className="flex justify-between">


        <div>

          {
            brand.logo_url ? (

              <img
                src={brand.logo_url}
                className="mb-4 h-16 object-contain"
                alt="Logo"
              />

            ) : null
          }


          <h1 className="text-3xl font-bold">

            {
              brand.name ||
              "Company"
            }

          </h1>


          {
            brand.legal?.legal_name ? (

              <div className="mt-2 text-sm">

                {
                  brand.legal.legal_name
                }

              </div>

            ) : null
          }


          {
            brand.legal?.tax_id ? (

              <div className="mt-1 text-sm">

                Tax ID:
                {" "}
                {
                  brand.legal.tax_id
                }

              </div>

            ) : null
          }


        </div>


        <div className="text-right">

          <div className="text-4xl font-bold">

            {title}

          </div>

        </div>


      </div>


      <div className="mt-8 border-t pt-6">

        {children}

      </div>


    </div>

  );

}
