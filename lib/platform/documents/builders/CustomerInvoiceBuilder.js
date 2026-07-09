import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


export async function buildCustomerInvoiceDocument({

  data = {},

  context = {},

}) {


  let invoice =
    data.invoice || data;


  if (
    invoice.id &&
    !invoice.lines
  ) {

    const {
      data:loadedInvoice,
    } =
      await supabaseAdmin
        .from("customer_invoices")
        .select("*")
        .eq(
          "id",
          invoice.id
        )
        .maybeSingle();


    if (loadedInvoice) {

      invoice =
        loadedInvoice;

    }

  }


  let lines =
    data.lines ||
    invoice.lines ||
    [];


  if (
    invoice.id &&
    lines.length === 0
  ) {

    const {
      data:invoiceLines,
    } =
      await supabaseAdmin
        .from("customer_invoice_lines")
        .select("*")
        .eq(
          "customer_invoice_id",
          invoice.id
        )
        .order(
          "created_at",
          {
            ascending:true,
          }
        );


    console.log(
      {
        invoiceId: invoice.id,
        invoiceLines,
      }
    );


    lines =
      invoiceLines ||
      [];

  }


  let party =
    context.party ||
    null;


  if (
    !party &&
    invoice.customer_id
  ) {

    const {
      data:customer,
    } =
      await supabaseAdmin
        .from("customer_loyalty_accounts")
        .select(`
          party_id
        `)
        .eq(
          "id",
          invoice.customer_id
        )
        .maybeSingle();


    if(customer?.party_id){

      const {
        data:partyData,
      } =
        await supabaseAdmin
          .from("parties")
          .select("*")
          .eq(
            "id",
            customer.party_id
          )
          .maybeSingle();


      party =
        partyData || null;

    }

  }


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


  return {

    ...invoice,


    invoice_number:
      invoice.invoice_number ||
      null,


    invoice_date:
      invoice.invoice_date ||
      null,


    due_date:
      invoice.due_date ||
      null,


    party,


    lines,


    totals:{

      subtotal,

      tax_amount:
        Number(
          invoice.tax_amount || 0
        ),

      total_amount:
        Number(
          invoice.total_amount ||
          subtotal
        ),

    },

  };

}
