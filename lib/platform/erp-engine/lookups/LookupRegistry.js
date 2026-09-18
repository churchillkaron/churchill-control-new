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
import FinanceDimensionValueLookup from "./providers/FinanceDimensionValueLookup";
import FinanceDimensionLookup from "./providers/FinanceDimensionLookup";
import BudgetCategoryLookup from "./providers/BudgetCategoryLookup";
import { createAccountClassLookup } from "./providers/AccountClassLookup";
import AccountsPayableLookup from "./providers/AccountsPayableLookup";
import OpenCustomerInvoiceLookup from "./providers/OpenCustomerInvoiceLookup";
import JournalLookup from "./providers/JournalLookup";
import CustomerLookup from "./providers/CustomerLookup";
import LegalEntityLookup from "./providers/LegalEntityLookup";
import CustomerInvoiceLookup from "./providers/CustomerInvoiceLookup";
import FiscalPeriodLookup from "./providers/FiscalPeriodLookup";
import InventoryLocationLookup from "@/lib/inventory/lookups/InventoryLocationLookup";

const RevenueAccountLookup = createAccountClassLookup({ types: ["REVENUE"], categories: ["REVENUE", "OTHER_INCOME"] });
const ExpenseAccountLookup = createAccountClassLookup({ types: ["EXPENSE"], categories: ["COST_OF_SALES", "OPERATING_EXPENSE", "OTHER_EXPENSE"] });
const LiabilityAccountLookup = createAccountClassLookup({ types: ["LIABILITY"], categories: ["CURRENT_LIABILITY", "NON_CURRENT_LIABILITY"] });
const BankGlAccountLookup = createAccountClassLookup({ types: ["ASSET"], categories: ["CURRENT_ASSET"] });





const ItemLookup = new ScopedFinanceLookup({
  // Invoice lines may originate from Inventory or Commercial product/service masters.
  // The line description remains authoritative when an organization has no catalogue.
  tables: ["inventory_items", "products"],
  valueKeys: ["id", "item_id", "product_id"],
  labelKeys: ["item_name", "product_name", "name", "display_name", "sku", "code", "id"],
  descriptionKeys: ["sku", "code", "description"],
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
  "inventory_locations": InventoryLocationLookup,
  "items": ItemLookup,
  "customers": CustomerLookup,
  "legal_entities": LegalEntityLookup,
  "customer_invoices": CustomerInvoiceLookup,
  "open_customer_invoices": OpenCustomerInvoiceLookup,
  "bank_statements": BankStatementLookup,
  "finance_report_templates": FinanceReportTemplateLookup,
  "accounts_payable": AccountsPayableLookup,
  "fiscal_periods": FiscalPeriodLookup,
  "finance_dimensions": FinanceDimensionLookup,
  "finance_dimension_values": FinanceDimensionValueLookup,
  "budget_categories": BudgetCategoryLookup,
  "revenue_accounts": RevenueAccountLookup,
  "expense_accounts": ExpenseAccountLookup,
  "liability_accounts": LiabilityAccountLookup,
  "bank_gl_accounts": BankGlAccountLookup,
  "finance_roles": FinanceRoleLookup,
  "finance_role_codes": FinanceRoleCodeLookup,
  "finance_permissions": FinancePermissionLookup,
  "finance_assignees": FinanceAssigneeLookup,
  "journals": JournalLookup,
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
