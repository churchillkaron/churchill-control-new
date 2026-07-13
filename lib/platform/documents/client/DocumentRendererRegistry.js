import InvoiceRenderer from "@/components/workspace/documents/renderers/InvoiceRenderer";

import ReportRenderer from "@/components/workspace/documents/renderers/ReportRenderer";


const RENDERERS = {

  CustomerInvoice:
    InvoiceRenderer,

  FinancialReport:
    ReportRenderer,

};


export function getDocumentRenderer(type){

  return (
    RENDERERS[type]
    || null
  );

}
