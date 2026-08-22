import { getFinanceWorkspaceContract } from "./FinanceWorkspaceContracts";

const REPORT_TYPE_OPTIONS = Object.freeze([
  { value: "profit_loss", label: "Profit & Loss" },
  { value: "balance_sheet", label: "Balance Sheet" },
  { value: "cash_flow", label: "Cash Flow" },
  { value: "trial_balance", label: "Trial Balance" },
]);

const DOCUMENT_TYPE_OPTIONS = Object.freeze([
  { value: "CUSTOMER_INVOICE", label: "Customer Invoice" },
  { value: "CUSTOMER_CREDIT_NOTE", label: "Customer Credit Note" },
  { value: "CUSTOMER_PAYMENT", label: "Customer Payment" },
  { value: "VENDOR_BILL", label: "Vendor Bill" },
  { value: "VENDOR_CREDIT_NOTE", label: "Vendor Credit Note" },
  { value: "VENDOR_PAYMENT", label: "Vendor Payment" },
  { value: "PURCHASE_ORDER", label: "Purchase Order" },
  { value: "JOURNAL_ENTRY", label: "Journal Entry" },
  { value: "BANK_PAYMENT", label: "Bank Payment" },
  { value: "BANK_RECEIPT", label: "Bank Receipt" },
  { value: "FIXED_ASSET", label: "Fixed Asset" },
  { value: "FORECAST", label: "Forecast" },
  { value: "BUDGET", label: "Budget" },
]);

const TIMEZONE_OPTIONS = Object.freeze([
  { value: "Asia/Bangkok", label: "Bangkok (UTC+7)" },
  { value: "Asia/Singapore", label: "Singapore (UTC+8)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (UTC+8)" },
  { value: "Asia/Tokyo", label: "Tokyo (UTC+9)" },
  { value: "Asia/Dubai", label: "Dubai (UTC+4)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Stockholm", label: "Stockholm" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "America/Denver", label: "Denver" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "Australia/Sydney", label: "Sydney" },
]);

function replaceSchema(capabilityId, schema) {
  const contract = getFinanceWorkspaceContract(capabilityId);
  if (!contract) return null;
  contract.schema = schema;
  return contract;
}

function convergeReportBuilder() {
  const contract = replaceSchema("report_builder", [
    { name: "name", label: "Report Name", type: "text", required: true, placeholder: "Example: Monthly Board P&L" },
    { name: "report_type", label: "Report Engine", type: "select", options: REPORT_TYPE_OPTIONS, required: true },
    { name: "description", label: "Purpose / Description", type: "textarea", width: "full", rows: 4, placeholder: "Describe what this report is for and who will use it." },
    { name: "definition_json", label: "Report Definition", type: "hidden", required: true, defaultValue: {} },
  ]);

  if (!contract) return;
  const runAction = {
    id: "run_report_template",
    type: "workflow",
    label: "Run Report",
    title: "Run Finance Report",
    capability: "report_builder",
    action: "run_report_template",
    form: "report-template-run",
    endpoint: "/api/finance/report-builder/run",
    method: "POST",
  };
  const actions = Array.isArray(contract.actions) ? contract.actions : [];
  contract.actions = [runAction, ...actions.filter((action) => action?.id !== runAction.id)];
}

function convergeScheduledReports() {
  replaceSchema("scheduled_reports", [
    { name: "report_template_id", label: "Report Template", type: "lookup", lookup: "finance_report_templates", required: true },
    { name: "entity_id", label: "Legal Entity", type: "lookup", lookup: "legal_entities", required: true },
    { name: "name", label: "Schedule Name", type: "text", required: true, placeholder: "Example: Monday Management Pack" },
    { name: "frequency", label: "Frequency", type: "select", options: ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"], required: true },
    { name: "next_run_at", label: "First Run", type: "datetime-local", required: true },
    { name: "timezone", label: "Timezone", type: "select", options: TIMEZONE_OPTIONS, required: true, defaultValue: "Asia/Bangkok" },
  ]);
}

function convergeOrganizationProfile() {
  replaceSchema("organization_profile", [
    { name: "legal_name", label: "Legal Name", type: "text", required: true, width: "full" },
    { name: "trading_name", label: "Trading Name", type: "text" },
    { name: "company_registration_number", label: "Company Registration Number", type: "text" },
    { name: "tax_registration_number", label: "Tax Registration Number", type: "text" },
    { name: "registered_address_line1", label: "Registered Address Line 1", type: "text", required: true, width: "full" },
    { name: "registered_address_line2", label: "Registered Address Line 2", type: "text", width: "full" },
    { name: "city", label: "City", type: "text", required: true },
    { name: "state_region", label: "State / Province / Region", type: "text" },
    { name: "postal_code", label: "Postal Code", type: "text" },
    { name: "country_code", label: "Country Code", type: "text", required: true, placeholder: "TH" },
    { name: "functional_currency", label: "Functional Currency", type: "currency", required: true },
    { name: "reporting_currency", label: "Reporting Currency", type: "currency", required: false },
    { name: "accounting_standard", label: "Accounting Standard", type: "text", required: true, placeholder: "Example: TFRS or IFRS" },
    { name: "fiscal_year_start_month", label: "Fiscal Year Start Month", type: "number", required: true, min: 1, max: 12, defaultValue: 1 },
    { name: "timezone", label: "Timezone", type: "text", required: true, defaultValue: "Asia/Bangkok", placeholder: "IANA timezone, e.g. Asia/Bangkok" },
    { name: "locale", label: "Locale", type: "text", required: true, defaultValue: "en-GB", placeholder: "BCP 47 locale, e.g. en-GB" },
    { name: "contact_email", label: "Contact Email", type: "email" },
    { name: "contact_phone", label: "Contact Phone", type: "text" },
    { name: "website", label: "Website", type: "text", width: "full" },
  ]);
}

function convergeNumberSequences() {
  const contract = getFinanceWorkspaceContract("number_sequences");
  if (!contract?.schema) return;
  contract.schema = contract.schema.map((field) =>
    field?.name === "document_type"
      ? { ...field, type: "select", label: "Document Type", options: DOCUMENT_TYPE_OPTIONS, required: true }
      : field
  );
}

function convergeApprovalWorkflows() {
  const contract = getFinanceWorkspaceContract("approval_workflows");
  if (!contract?.schema) return;
  contract.schema = contract.schema.map((field) => {
    if (field?.name === "document_type") return { ...field, type: "select", label: "Document Type", options: DOCUMENT_TYPE_OPTIONS, required: true };
    if (field?.name === "approver_role") return { ...field, type: "lookup", label: "Approver Role", lookup: "finance_role_codes", required: true };
    return field;
  });
}

export function applyFinanceConfigurationContractConvergence() {
  convergeReportBuilder();
  convergeScheduledReports();
  convergeOrganizationProfile();
  convergeNumberSequences();
  convergeApprovalWorkflows();
}