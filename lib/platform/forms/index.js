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
import {
  enforceFinancePermissionFormContract,
} from "./FinancePermissionFormContract";

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

  const vendorPaymentFields = enforceFinanceVendorPaymentFormContract(
    formId,
    receiptFields
  );

  return enforceFinancePermissionFormContract(
    formId,
    vendorPaymentFields
  );
}
