import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  generateDocumentNumber,
} from "@/lib/platform/documents/DocumentNumberService";


export default async function createCustomerInvoice({

  organization_id,
  entity_id,
  customer_id,

  invoice_date,
  due_date,

  lines = [],

  notes = null,

}) {

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!entity_id) {
    throw new Error("entity_id required");
  }

  if (!customer_id) {
    throw new Error("customer_id required");
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("invoice lines required");
  }


  const finalInvoiceDate =
    invoice_date ||
    new Date()
      .toISOString()
      .slice(0,10);


  const normalizedLines =
    lines.map(line => {

      const quantity =
        Number(line.quantity || 0);

      const unitPrice =
        Number(line.unit_price || 0);

      return {

        description:
          line.description || "",

        quantity,

        unit_price:
          unitPrice,

        line_total:
          quantity * unitPrice,

      };

    });


  const subtotal =
    normalizedLines.reduce(
      (sum, line) =>
        sum + line.line_total,
      0
    );


  const tax_amount = 0;

  const total_amount =
    subtotal + tax_amount;


  const invoice_number =
    await generateDocumentNumber({

      organization_id,

      entity_id,

      document_type:"invoice",

      prefix:"INV",

    });


  const {
    data: invoice,
    error: invoiceError,
  } =
    await supabaseAdmin
      .from("customer_invoices")
      .insert({

        organization_id,

        entity_id,

        customer_id,

        invoice_number,

        invoice_date:
          finalInvoiceDate,

        due_date,

        subtotal,

        tax_amount,

        total_amount,

        outstanding_balance:
          total_amount,

        status:"OPEN",

        notes,

      })
      .select()
      .single();


  if (invoiceError) {
    throw invoiceError;
  }


  const invoiceLines =
    normalizedLines.map(line => ({

      organization_id,

      entity_id,

      customer_invoice_id:
        invoice.id,

      description:
        line.description,

      quantity:
        line.quantity,

      unit_price:
        line.unit_price,

      line_total:
        line.line_total,

    }));


  const {
    error: lineError,
  } =
    await supabaseAdmin
      .from("customer_invoice_lines")
      .insert(invoiceLines);


  if (lineError) {
    throw lineError;
  }


  const {
    data: receivable,
    error: receivableError,
  } =
    await supabaseAdmin
      .from("accounts_receivable")
      .insert({

        organization_id,

        entity_id,

        customer_id,

        customer_invoice_id:
          invoice.id,

        amount:
          total_amount,

        outstanding_balance:
          total_amount,

        due_date,

        status:"OPEN",

      })
      .select()
      .single();


  if (receivableError) {
    throw receivableError;
  }


  return {

    success:true,

    invoice,

    lines:
      invoiceLines,

    receivable,

  };

}
