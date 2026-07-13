import {
  registerRenderer,
} from "../renderers/RendererRegistry";

import InvoiceRenderer
from "@/components/workspace/documents/renderers/InvoiceRenderer";


import FinancialReportRenderer
from "@/components/workspace/documents/renderers/FinancialReportRenderer";



export function registerDocumentRenderers(){

  registerRenderer(
    "CustomerInvoice",
    InvoiceRenderer
  );


  registerRenderer(
    "FinancialReport",
    FinancialReportRenderer
  );

}
