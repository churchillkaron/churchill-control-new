import {
  registerRenderer,
} from "../renderers/RendererRegistry";

import InvoiceRenderer
from "@/components/workspace/documents/renderers/InvoiceRenderer";


import ReportRenderer
from "@/components/workspace/documents/renderers/ReportRenderer";

import JournalDetailRenderer
from "@/components/workspace/documents/JournalDetailRenderer";



export function registerDocumentRenderers(){

  registerRenderer(
    "CustomerInvoice",
    InvoiceRenderer
  );


  registerRenderer(
    "FinancialReport",
    ReportRenderer
  );


  registerRenderer(
    "JournalEntry",
    JournalDetailRenderer
  );

}
