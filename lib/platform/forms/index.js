import { FormRegistry } from "./FormRegistry";
import {
  enforceFinanceFormContract,
} from "./FinanceFormContract";

export function getForm(formId) {
  const form =
    FormRegistry[formId];

  if (!form) {
    return [];
  }

  return enforceFinanceFormContract(
    formId,
    form.fields || []
  );
}
