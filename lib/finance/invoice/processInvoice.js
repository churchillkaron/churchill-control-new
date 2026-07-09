/**
 * INVOICE INTELLIGENCE ENGINE
 *
 * Converts OCR text into finance document data.
 *
 * Finance owns interpretation.
 * Service owns OCR extraction.
 */


export async function processInvoice({

  ocrText,

  organizationId,

}) {


  if (!ocrText) {

    return {

      success:false,

      error:"NO_INVOICE_DATA",

    };

  }



  const lines =
    ocrText
      .split("\n")
      .map(line =>
        line.trim()
      )
      .filter(Boolean);



  const extractNumber = (text) => {

    const match =
      text?.match(/[\d,.]+/);


    return match
      ? Number(
          match[0]
            .replace(/,/g,"")
        )
      : 0;

  };



  const totalLine =
    lines.find(line =>
      line
        .toLowerCase()
        .includes("total")
    );



  const vatLine =
    lines.find(line =>
      line
        .toLowerCase()
        .includes("vat") ||
      line
        .toLowerCase()
        .includes("tax")
    );



  const invoiceNumberLine =
    lines.find(line =>
      line
        .toLowerCase()
        .includes("invoice")
    );



  const vendorName =
    lines[0] ||
    "UNKNOWN";



  const result = {

    organizationId,


    vendor_name:
      vendorName,


    invoice_number:
      invoiceNumberLine || null,


    invoice_date:
      null,


    due_date:
      null,


    currency_code:
      "THB",


    subtotal:
      0,


    tax_amount:
      extractNumber(vatLine),


    discount_amount:
      0,


    total_amount:
      extractNumber(totalLine),


    category:
      classifyExpense(
        ocrText
      ),


    confidence:
      0.78,

  };



  return {

    success:true,

    data:result,

  };

}



/**
 * BASIC FINANCE CLASSIFICATION
 */

function classifyExpense(text) {

  const t =
    text.toLowerCase();



  if (
    t.includes("food") ||
    t.includes("restaurant")
  ) {

    return "COGS_FOOD";

  }



  if (
    t.includes("salary") ||
    t.includes("wage")
  ) {

    return "PAYROLL";

  }



  if (
    t.includes("electric") ||
    t.includes("water")
  ) {

    return "UTILITIES";

  }



  return "OPERATING_EXPENSE";

}
