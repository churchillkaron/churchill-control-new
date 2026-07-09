import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


export async function createVendorInvoice({

  organizationId,

  entityId,

  vendorPartyId = null,

  purchaseOrderId = null,

  goodsReceiptId = null,

  documentId = null,

  invoiceNumber,

  invoiceDate,

  dueDate = null,

  currencyCode = "THB",

  exchangeRate = 1,

  subtotal = 0,

  taxAmount = 0,

  discountAmount = 0,

  totalAmount = 0,

  source = "manual",

  aiExtracted = false,

  ocrConfidence = 0,

  createdBy = null,

}) {


  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("vendor_invoices")
      .insert({

        organization_id:
          organizationId,

        entity_id:
          entityId,


        vendor_party_id:
          vendorPartyId,


        purchase_order_id:
          purchaseOrderId,


        goods_receipt_id:
          goodsReceiptId,


        document_id:
          documentId,


        invoice_number:
          invoiceNumber,


        invoice_date:
          invoiceDate,


        due_date:
          dueDate,


        currency_code:
          currencyCode,


        exchange_rate:
          Number(exchangeRate),


        subtotal:
          Number(subtotal),


        tax_amount:
          Number(taxAmount),


        discount_amount:
          Number(discountAmount),


        total_amount:
          Number(totalAmount),


        outstanding_amount:
          Number(totalAmount),


        source,


        ai_extracted:
          Boolean(aiExtracted),


        ocr_confidence:
          Number(ocrConfidence),


        status:
          "RECEIVED",


        received_at:
          new Date().toISOString(),


        created_by:
          createdBy,

      })
      .select()
      .single();



  if (error) {

    throw error;

  }


  return data;

}
