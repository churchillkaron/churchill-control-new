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
import {
  getIntercompanyFormContract,
} from "@/lib/finance/intercompany/IntercompanyFormContract";
import {
  getFinanceDimensionFormContract,
} from "@/lib/finance/dimensions/FinanceDimensionFormContract";

export function getForm(formId) {
  const intercompanyForm = getIntercompanyFormContract(formId);
  if (intercompanyForm) return intercompanyForm;

  const dimensionForm = getFinanceDimensionFormContract(formId);
  if (dimensionForm) return dimensionForm;

  const form = FormRegistry[formId];

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
