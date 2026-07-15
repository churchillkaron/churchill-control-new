import AccountTypeLookup from "./providers/AccountTypeLookup";
import ChartOfAccountsLookup from "./providers/ChartOfAccountsLookup";
import DepartmentLookup from "./providers/DepartmentLookup";
import BusinessUnitLookup from "./providers/BusinessUnitLookup";
import BankAccountLookup from "./providers/BankAccountLookup";
import PaymentTermsLookup from "./providers/PaymentTermsLookup";
import TaxCodeLookup from "./providers/TaxCodeLookup";
import VendorLookup from "./providers/VendorLookup";
import EmployeeLookup from "./providers/EmployeeLookup";
import CostCenterLookup from "./providers/CostCenterLookup";
import ReportingGroupLookup from "./providers/ReportingGroupLookup";
import CurrencyLookup from "./providers/CurrencyLookup";

const REGISTRY = {

  "account-types":
    AccountTypeLookup,

  "chart_of_accounts":
    ChartOfAccountsLookup,

  "departments":
    DepartmentLookup,

  "business_units":
    BusinessUnitLookup,

  "bank_accounts":
    BankAccountLookup,

  "payment_terms":
    PaymentTermsLookup,

  "tax_codes":
    TaxCodeLookup,

  "vendors":
    VendorLookup,

  "employees":
    EmployeeLookup,

  "cost_centers":
    CostCenterLookup,

  "reporting_groups":
    ReportingGroupLookup,

  "currencies":
    CurrencyLookup,

};

export function registerLookup(
  key,
  provider,
) {

  REGISTRY[key] =
    provider;

}

export function resolveLookup(
  key,
) {

  return REGISTRY[key] || null;

}

export default REGISTRY;
