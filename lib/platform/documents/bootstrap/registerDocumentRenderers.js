import {
  registerRenderer,
} from "../renderers/RendererRegistry";

import InvoiceRenderer
from "@/components/workspace/documents/renderers/InvoiceRenderer";


import ReportRenderer
from "@/components/workspace/documents/renderers/ReportRenderer";



export function registerDocumentRenderers(){

  registerRenderer(
    "CustomerInvoice",
    InvoiceRenderer
  );


  registerRenderer(
    "FinancialReport",
    ReportRenderer
  );

}
