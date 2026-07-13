"use client";


export default function DocumentHeader({

  brand = {},

  title = "",

}) {

  return (

    <div
      className="
        flex
        justify-between
      "
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


        <h1
          className="
            text-3xl
            font-bold
          "
        >

          {
            brand.name ||
            "Company Name"
          }

        </h1>


        {
          brand.legal?.legal_name ? (

            <div
              className="
                mt-2
                text-sm
              "
            >

              {
                brand.legal.legal_name
              }

            </div>

          ) : null
        }


        {
          brand.legal?.tax_id ? (

            <div
              className="
                mt-1
                text-sm
              "
            >

              Tax ID:
              {" "}
              {
                brand.legal.tax_id
              }

            </div>

          ) : null
        }


      </div>


      <div
        className="
          text-right
        "
      >

        <div
          className="
            text-4xl
            font-bold
          "
        >

          {
            title
          }

        </div>

      </div>


    </div>

  );

}
