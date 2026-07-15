import InvoiceRenderer from "@/components/workspace/documents/renderers/InvoiceRenderer";

import ReportRenderer from "@/components/workspace/documents/renderers/ReportRenderer";
import JournalDetailRenderer from "@/components/workspace/documents/JournalDetailRenderer";


const RENDERERS = {

  CustomerInvoice:
    InvoiceRenderer,

  FinancialReport:
    ReportRenderer,

  JournalEntry:
    JournalDetailRenderer,

};


export function getDocumentRenderer(type){

  return (
    RENDERERS[type]
    || null
  );

}
