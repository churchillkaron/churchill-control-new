import { FormRegistry } from "./FormRegistry";
import {
  enforceFinanceFormContract,
} from "./FinanceFormContract";
import {
  enforceFinanceReceiptFormContract,
} from "./FinanceReceiptFormContract";

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

  return enforceFinanceReceiptFormContract(
    formId,
    financeFields
  );
}
