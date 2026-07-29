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
import ProjectLookup from "./providers/ProjectLookup";
import ScopedFinanceLookup from "./providers/ScopedFinanceLookup";
import FinanceRoleLookup from "./providers/FinanceRoleLookup";
import FinanceRoleCodeLookup from "./providers/FinanceRoleCodeLookup";
import FinancePermissionLookup from "./providers/FinancePermissionLookup";
import FinanceAssigneeLookup from "./providers/FinanceAssigneeLookup";
import IntercompanyAccountLookup from "./providers/IntercompanyAccountLookup";

const CustomerLookup = new ScopedFinanceLookup({
  tables: ["customer_loyalty_accounts", "customers"],
  valueKeys: ["customer_id", "id", "party_id"],
  labelKeys: ["customer_name", "display_name", "company_name", "id"],
  descriptionKeys: ["customer_email", "email", "customer_phone", "phone"],
});

const LegalEntityLookup = new ScopedFinanceLookup({
  tables: ["legal_entities", "organization_entities"],
  labelKeys: ["legal_name", "name", "code", "id"],
  descriptionKeys: ["code", "country"],
});

const CustomerInvoiceLookup = new ScopedFinanceLookup({
  tables: ["customer_invoices"],
  labelKeys: ["invoice_number", "reference_number", "id"],
  descriptionKeys: ["customer_name", "due_date", "status"],
  entityScoped: true,
});

const BankStatementLookup = new ScopedFinanceLookup({
  tables: ["finance_bank_statement_imports"],
  labelKeys: ["statement_number", "import_reference", "id"],
  descriptionKeys: ["statement_start_date", "statement_end_date", "status"],
  entityScoped: true,
});

const FinanceReportTemplateLookup = new ScopedFinanceLookup({
  tables: ["finance_report_templates"],
  labelKeys: ["name", "report_type", "id"],
  descriptionKeys: ["report_type", "status"],
});

const REGISTRY = {
  "account-types": AccountTypeLookup,
  "chart_of_accounts": ChartOfAccountsLookup,
  "intercompany_accounts": IntercompanyAccountLookup,
  "departments": DepartmentLookup,
  "business_units": BusinessUnitLookup,
  "bank_accounts": BankAccountLookup,
  "payment_terms": PaymentTermsLookup,
  "tax_codes": TaxCodeLookup,
  "vendors": VendorLookup,
  "employees": EmployeeLookup,
  "cost_centers": CostCenterLookup,
  "reporting_groups": ReportingGroupLookup,
  "currencies": CurrencyLookup,
  "projects": ProjectLookup,
  "customers": CustomerLookup,
  "legal_entities": LegalEntityLookup,
  "customer_invoices": CustomerInvoiceLookup,
  "bank_statements": BankStatementLookup,
  "finance_report_templates": FinanceReportTemplateLookup,
  "finance_roles": FinanceRoleLookup,
  "finance_role_codes": FinanceRoleCodeLookup,
  "finance_permissions": FinancePermissionLookup,
  "finance_assignees": FinanceAssigneeLookup,
};

export function registerLookup(
  key,
  provider,
) {
  REGISTRY[key] = provider;
}

export function resolveLookup(
  key,
) {
  return REGISTRY[key] || null;
}

export default REGISTRY;
