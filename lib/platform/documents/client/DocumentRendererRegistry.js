import InvoiceRenderer from "@/components/workspace/documents/renderers/InvoiceRenderer";


const RENDERERS = {

  CustomerInvoice:
    InvoiceRenderer,

};


export function getDocumentRenderer(type){

  return (
    RENDERERS[type]
    || null
  );

}
