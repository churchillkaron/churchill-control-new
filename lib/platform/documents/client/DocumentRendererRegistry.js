import InvoiceRenderer from "@/components/workspace/documents/renderers/InvoiceRenderer";

import FinancialReportRenderer from "@/components/workspace/documents/renderers/FinancialReportRenderer";


const RENDERERS = {

  CustomerInvoice:
    InvoiceRenderer,

  FinancialReport:
    FinancialReportRenderer,

};


export function getDocumentRenderer(type){

  return (
    RENDERERS[type]
    || null
  );

}
