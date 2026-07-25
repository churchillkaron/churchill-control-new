import { FormRegistry } from "./FormRegistry";
import {
  enforceFinanceFormContract,
} from "./FinanceFormContract";
import {
  enforceFinanceReceiptFormContract,
} from "./FinanceReceiptFormContract";
import {
  enforceFinanceVendorPaymentFormContract,
} from "./FinanceVendorPaymentFormContract";

export function getForm(formId) {
  const form =
    FormRegistry[formId];

  if (!form) {
    return [];
  }

  const financeFields = enforceFinanceFormContract(
    formId,
    form.fields || []
  );

  const receiptFields = enforceFinanceReceiptFormContract(
    formId,
    financeFields
  );

  return enforceFinanceVendorPaymentFormContract(
    formId,
    receiptFields
  );
}
