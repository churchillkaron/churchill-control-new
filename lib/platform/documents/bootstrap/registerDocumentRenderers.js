import {
  registerRenderer,
} from "../renderers/RendererRegistry";

import InvoiceRenderer
from "@/components/workspace/documents/renderers/InvoiceRenderer";


export function registerDocumentRenderers(){

  registerRenderer(
    "CustomerInvoice",
    InvoiceRenderer
  );

}
