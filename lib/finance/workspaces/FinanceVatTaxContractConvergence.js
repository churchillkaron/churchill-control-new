import { getFinanceWorkspaceContract } from "./FinanceWorkspaceContracts";

const TAX_TYPE_OPTIONS = Object.freeze([
  { value: "VAT", label: "Value Added Tax (VAT)" },
  { value: "WITHHOLDING", label: "Withholding Tax" },
  { value: "OTHER", label: "Other Tax" },
]);

export function applyFinanceVatTaxContractConvergence() {
  const taxCodes = getFinanceWorkspaceContract("tax_codes");
  if (taxCodes) {
    taxCodes.schema = [
      { name: "code", label: "Tax Code", type: "text", required: true },
      { name: "name", label: "Tax Name", type: "text", required: true },
      { name: "tax_type", label: "Tax Type", type: "select", options: TAX_TYPE_OPTIONS, required: true, defaultValue: "VAT" },
      { name: "rate", label: "Tax Rate", type: "number", required: true, min: 0, step: "0.0001", help: "Enter 0.07 for 7%." },
      { name: "regime", label: "Tax Regime / Jurisdiction", type: "text", required: true, placeholder: "Example: THAILAND" },
      { name: "standard", label: "Accounting Standard", type: "text", required: true, placeholder: "Example: TFRS" },
      { name: "effective_from", label: "Effective From", type: "date" },
      { name: "effective_to", label: "Effective To", type: "date" },
      { name: "is_active", label: "Active", type: "checkbox", defaultValue: true },
    ];
  }

  const vatReturns = getFinanceWorkspaceContract("vat_returns");
  if (vatReturns) {
    vatReturns.schema = [
      { name: "entity_id", label: "Legal Entity", type: "lookup", lookup: "legal_entities", required: true, width: "full" },
      { name: "period_id", label: "Fiscal Period", type: "lookup", lookup: "fiscal_periods" },
      { name: "period_start", label: "VAT Period Start", type: "date", required: true },
      { name: "period_end", label: "VAT Period End", type: "date", required: true },
      { name: "filing_due_date", label: "Filing Due Date", type: "date" },
      { name: "registration_reference", label: "VAT Registration Reference", type: "text" },
      { name: "jurisdiction_code", label: "Tax Regime / Jurisdiction", type: "text", required: true, placeholder: "Example: THAILAND" },
      { name: "notes", label: "Notes", type: "textarea", width: "full" },
    ];

    const calculateAction = {
      id: "calculate_vat_return",
      type: "workflow",
      label: "Calculate VAT Return",
      title: "Calculate VAT Return from Posted Accounting Evidence",
      endpoint: "/api/finance/vat-returns/calculate",
      method: "POST",
    };
    const markSubmittedAction = {
      id: "mark_vat_return_submitted",
      type: "workflow",
      label: "Mark Submitted",
      title: "Record External VAT Submission",
      form: "vat-return-mark-submitted",
      endpoint: "/api/finance/vat-returns/mark-submitted",
      method: "POST",
    };

    const rowActions = Array.isArray(vatReturns.rowActions) ? vatReturns.rowActions : [];
    vatReturns.rowActions = [
      calculateAction,
      markSubmittedAction,
      ...rowActions.filter(action =>
        action?.id !== calculateAction.id && action?.id !== markSubmittedAction.id
      ),
    ];
  }
}
