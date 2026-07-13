import {
  registerDocumentBuilder,
} from "./DocumentBuilderRegistry";

import {
  buildCustomerInvoiceDocument,
} from "./CustomerInvoiceBuilder";


import {
  buildFinancialReportDocument,
} from "./FinancialReportBuilder";


export function registerDocumentBuilders(){

  registerDocumentBuilder(
    "CustomerInvoice",
    buildCustomerInvoiceDocument
  );


  registerDocumentBuilder(
    "FinancialReport",
    buildFinancialReportDocument
  );

}
