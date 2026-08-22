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
  enforceFinanceFiscalPeriodFormContract,
} from "./FinanceFiscalPeriodFormContract";
import {
  getFinanceOperationalFormContract,
} from "./FinanceOperationalFormContract";
import {
  getIntercompanyFormContract,
} from "@/lib/finance/intercompany/IntercompanyFormContract";
import {
  getFinanceDimensionFormContract,
} from "@/lib/finance/dimensions/FinanceDimensionFormContract";
import {
  getChartOfAccountFormContract,
} from "@/lib/finance/chart-of-accounts/ChartOfAccountFormContract";
import {
  getBudgetFormContract,
} from "@/lib/finance/budgeting/BudgetFormContract";

export function getForm(formId) {
  const operationalForm = getFinanceOperationalFormContract(formId);
  if (operationalForm) return operationalForm;

  const intercompanyForm = getIntercompanyFormContract(formId);
  if (intercompanyForm) return intercompanyForm;

  const dimensionForm = getFinanceDimensionFormContract(formId);
  if (dimensionForm) return dimensionForm;

  const chartOfAccountForm = getChartOfAccountFormContract(formId);
  if (chartOfAccountForm) return chartOfAccountForm;

  const budgetForm = getBudgetFormContract(formId);
  if (budgetForm) return budgetForm;

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

  const permissionFields = enforceFinancePermissionFormContract(
    formId,
    vendorPaymentFields
  );

  return enforceFinanceFiscalPeriodFormContract(
    formId,
    permissionFields
  );
}
