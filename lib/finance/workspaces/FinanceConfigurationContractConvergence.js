import { getFinanceWorkspaceContract } from "./FinanceWorkspaceContracts";
import {
  ACCOUNTING_POLICY_FORM_OPTIONS,
  ACCOUNTING_POLICY_FORM_VALUE_OPTIONS,
} from "@/lib/finance/accounting-settings/AccountingPolicyWritePolicy";
import { FINANCE_DOCUMENT_SEQUENCE_TYPES } from "@/lib/finance/number-sequences/FinanceNumberSequencePolicy";

const REPORT_TYPE_OPTIONS = Object.freeze([
  { value: "profit_loss", label: "Profit & Loss" },
  { value: "balance_sheet", label: "Balance Sheet" },
  { value: "cash_flow", label: "Cash Flow" },
  { value: "trial_balance", label: "Trial Balance" },
]);

const APPROVAL_DOCUMENT_TYPES = Object.freeze([
  "JOURNAL_ENTRY",
  "VENDOR_BILL",
  "VENDOR_PAYMENT",
  "CUSTOMER_CREDIT_NOTE",
  "CUSTOMER_REFUND",
  "BANK_PAYMENT",
  "PURCHASE_ORDER",
  "EXPENSE_CLAIM",
  "WRITE_OFF",
  "PERIOD_CLOSE",
  "YEAR_END_CLOSE",
].map((value) => ({
  value,
  label: value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()),
})));

const SEQUENCE_DOCUMENT_TYPES = Object.freeze(
  FINANCE_DOCUMENT_SEQUENCE_TYPES.map((value) => ({
    value,
    label: value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()),
  }))
);

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

const ACCOUNTING_STANDARD_OPTIONS = Object.freeze([
  { value: "TFRS", label: "Thai Financial Reporting Standards (TFRS)" },
  { value: "IFRS", label: "International Financial Reporting Standards (IFRS)" },
  { value: "IFRS_FOR_SMES", label: "IFRS for SMEs" },
  { value: "US_GAAP", label: "US GAAP" },
  { value: "LOCAL_GAAP", label: "Local GAAP" },
]);

const LOCALE_OPTIONS = Object.freeze([
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-US", label: "English (United States)" },
  { value: "th-TH", label: "Thai (Thailand)" },
  { value: "sv-SE", label: "Swedish (Sweden)" },
]);

const FISCAL_MONTH_OPTIONS = Object.freeze([
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
].map((label, index) => ({ value: index + 1, label })));

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
    id: "run_report_template", type: "workflow", label: "Run Report", title: "Run Finance Report",
    capability: "report_builder", action: "run_report_template", form: "report-template-run",
    endpoint: "/api/finance/report-builder/run", method: "POST",
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
    { name: "country_code", label: "Country Code", type: "text", required: true, placeholder: "Two-letter ISO code, e.g. TH" },
    { name: "functional_currency", label: "Functional Currency", type: "currency", required: true },
    { name: "reporting_currency", label: "Reporting Currency", type: "currency" },
    { name: "accounting_standard", label: "Accounting Standard", type: "select", options: ACCOUNTING_STANDARD_OPTIONS, required: true, defaultValue: "TFRS" },
    { name: "fiscal_year_start_month", label: "Fiscal Year Starts", type: "select", options: FISCAL_MONTH_OPTIONS, required: true, defaultValue: 1 },
    { name: "timezone", label: "Timezone", type: "select", options: TIMEZONE_OPTIONS, required: true, defaultValue: "Asia/Bangkok" },
    { name: "locale", label: "Locale", type: "select", options: LOCALE_OPTIONS, required: true, defaultValue: "en-GB" },
    { name: "contact_email", label: "Contact Email", type: "email" },
    { name: "contact_phone", label: "Contact Phone", type: "text" },
    { name: "website", label: "Website", type: "text", width: "full" },
  ]);
}

function convergeAccountingSettings() {
  replaceSchema("accounting_settings", [
    { name: "setting_key", label: "Accounting Policy", type: "select", options: ACCOUNTING_POLICY_FORM_OPTIONS, required: true, width: "full" },
    {
      name: "policy_value", label: "Policy Value", type: "dependent-select", dependsOn: "setting_key",
      dependsOnLabel: "Accounting Policy", optionsByValue: ACCOUNTING_POLICY_FORM_VALUE_OPTIONS, required: true, width: "full",
    },
    { name: "effective_from", label: "Effective From", type: "date", required: true },
    { name: "effective_to", label: "Effective To", type: "date" },
    { name: "value_json", label: "Configuration", type: "hidden", defaultValue: {} },
    { name: "status", label: "Status", type: "hidden", defaultValue: "ACTIVE" },
  ]);
}

function convergeNumberSequences() {
  const contract = getFinanceWorkspaceContract("number_sequences");
  if (!contract?.schema) return;
  contract.schema = contract.schema.map((field) =>
    field?.name === "document_type"
      ? { ...field, type: "select", label: "Document Type", options: SEQUENCE_DOCUMENT_TYPES, required: true }
      : field
  );
}

function convergeApprovalWorkflows() {
  replaceSchema("approval_workflows", [
    { name: "entity_id", label: "Legal Entity", type: "lookup", lookup: "legal_entities" },
    { name: "name", label: "Workflow Name", type: "text", required: true },
    { name: "document_type", label: "Document Type", type: "select", options: APPROVAL_DOCUMENT_TYPES, required: true },
    { name: "threshold_amount", label: "Threshold Amount", type: "number", required: true, min: 0, defaultValue: 0 },
    { name: "currency_code", label: "Threshold Currency", type: "currency", required: true },
    { name: "approver_role", label: "Approver Role", type: "lookup", lookup: "finance_role_codes", required: true },
    { name: "required_approvals", label: "Required Approvals", type: "number", required: true, min: 1, defaultValue: 1 },
    { name: "effective_from", label: "Effective From", type: "date", required: true },
    { name: "effective_to", label: "Effective To", type: "date" },
  ]);
}

export function applyFinanceConfigurationContractConvergence() {
  convergeReportBuilder();
  convergeScheduledReports();
  convergeOrganizationProfile();
  convergeAccountingSettings();
  convergeNumberSequences();
  convergeApprovalWorkflows();
}
