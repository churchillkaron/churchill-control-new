import {
  registerDocumentBuilder,
} from "./DocumentBuilderRegistry";

import {
  buildCustomerInvoiceDocument,
} from "./CustomerInvoiceBuilder";


export function registerDocumentBuilders(){

  registerDocumentBuilder(
    "CustomerInvoice",
    buildCustomerInvoiceDocument
  );

}
