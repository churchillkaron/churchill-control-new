import { FormRegistry } from "./FormRegistry";

export function getForm(formId) {

  const form =
    FormRegistry[formId];

  if (!form) {
    return [];
  }

  return form.fields || [];

}
