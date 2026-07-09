"use client";


export default function InvoiceRenderer({

  data = {},

  template = {},

  brand = {},

}) {


  const document =
    data.data || {};


  const party =
    data.party || {};


  console.log(
    "INVOICE TEMPLATE DEBUG",
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
      "invoice_info",
      "customer",
      "lines",
      "totals",
      "payment",
      "footer"
    ];


  const lines =
    document.lines || [];


  const subtotal =
    lines.reduce(
      (sum,line)=>
        sum +
        (
          Number(line.quantity || 0) *
          Number(line.unit_price || 0)
        ),
      0
    );


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


    if(block === "invoice_info"){

      return (

        <div
          key={block}
          className="mt-8 flex justify-end border-t pt-6"
        >

          <div className="w-64 text-sm">

            <div className="flex justify-between">

              <span>
                Invoice No:
              </span>

              <span className="font-semibold">
                {document.invoice_number || "-"}
              </span>

            </div>


            <div className="mt-2 flex justify-between">

              <span>
                Invoice Date:
              </span>

              <span>
                {document.invoice_date || "-"}
              </span>

            </div>


            <div className="mt-2 flex justify-between">

              <span>
                Due Date:
              </span>

              <span>
                {document.due_date || "-"}
              </span>

            </div>

          </div>

        </div>

      );

    }


    if(
      block === "party" ||
      block === "customer"
    ){

      return (

        <div key={block} className="mt-10 border-t pt-6">

          <div className="text-sm text-gray-500">
            Bill To
          </div>

          <div className="mt-2 text-xl font-semibold">
            {party.display_name || "Customer"}
          </div>

          {
            party.email ? (
              <div className="text-sm">
                {party.email}
              </div>
            ) : null
          }

          {
            party.phone ? (
              <div className="text-sm">
                {party.phone}
              </div>
            ) : null
          }

        </div>

      );

    }


    if(block === "issuer"){

      return (

        <div key={block} className="mt-6 text-sm">

          <div className="font-semibold">
            From
          </div>

          <div>
            {brand.name || "Company"}
          </div>

          {
            brand.legal?.legal_name ? (
              <div>
                {brand.legal.legal_name}
              </div>
            ) : null
          }

        </div>

      );

    }


    if(block === "billing_period"){

      return (

        <div key={block} className="mt-6">

          <div className="text-sm text-gray-500">
            Billing Period
          </div>

          <div>
            {
              document.billing_period ||
              document.period ||
              "-"
            }
          </div>

        </div>

      );

    }


    if(
      block === "service_lines" ||
      block === "usage" ||
      block === "charges"
    ){

      return (

        <table
          key={block}
          className="mt-10 w-full"
        >

          <tbody>

          {
            lines.map((line,index)=>(

              <tr key={index} className="border-b">

                <td className="py-3">
                  {line.description}
                </td>

                <td className="text-right">
                  {
                    Number(line.quantity || 0) *
                    Number(line.unit_price || 0)
                  }
                </td>

              </tr>

            ))
          }

          </tbody>

        </table>

      );

    }


    if(block === "subscription"){

      return (

        <div key={block} className="mt-6">

          <div className="font-semibold">
            Subscription
          </div>

          <div>
            {
              document.subscription_name ||
              document.plan_name ||
              "-"
            }
          </div>

        </div>

      );

    }

    if(block === "lines"){

      return (

        <table
          key={block}
          className="mt-10 w-full"
        >

          <thead>

            <tr className="border-b">

              <th className="py-3 text-left">
                Description
              </th>

              <th>
                Qty
              </th>

              <th>
                Price
              </th>

              <th>
                Total
              </th>

            </tr>

          </thead>


          <tbody>

            {lines.map((line,index)=>(

              <tr
                key={index}
                className="border-b"
              >

                <td className="py-3">
                  {line.description}
                </td>

                <td className="text-center">
                  {line.quantity}
                </td>

                <td className="text-center">
                  {line.unit_price}
                </td>

                <td className="text-right">
                  {
                    Number(line.quantity || 0) *
                    Number(line.unit_price || 0)
                  }
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      );

    }


    if(block === "tax"){

      return (

        <div key={block} className="mt-4 text-right">

          VAT:
          {" "}
          0

        </div>

      );

    }


    if(block === "totals"){

      return (

        <div key={block} className="mt-6 text-right">

          <div>
            Subtotal:
            {" "}
            {document.totals?.subtotal || subtotal}
          </div>

          <div className="mt-2 text-2xl font-bold">

            Total:
            {" "}
            {document.totals?.total_amount || subtotal}

          </div>

        </div>

      );

    }


    if(block === "payment"){

      return (

        <div key={block} className="mt-8 text-sm">

          Payment Terms:
          {" "}
          30 days

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
                    {brand.payment.bank_name}
                  </div>

                  <div>
                    {brand.payment.account_name}
                  </div>

                  <div>
                    {brand.payment.account_number}
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
