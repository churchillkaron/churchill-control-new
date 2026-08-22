const FIXED_ASSET_FORM = Object.freeze([
  {
    name: "asset_name",
    label: "Asset Name",
    type: "text",
    required: true,
    width: "full",
  },
  {
    name: "asset_category",
    label: "Asset Category",
    type: "text",
  },
  {
    name: "purchase_date",
    label: "Purchase Date",
    type: "date",
  },
  {
    name: "purchase_cost",
    label: "Purchase Cost",
    type: "number",
    required: true,
    min: 0.01,
    step: "0.01",
  },
  {
    name: "salvage_value",
    label: "Residual / Salvage Value",
    type: "number",
    min: 0,
    step: "0.01",
    defaultValue: 0,
  },
  {
    name: "useful_life_years",
    label: "Useful Life (Years)",
    type: "number",
    required: true,
    min: 0.01,
    step: "any",
    defaultValue: 5,
  },
  {
    name: "depreciation_method",
    label: "Depreciation Method",
    type: "select",
    required: true,
    defaultValue: "straight_line",
    options: [
      { value: "straight_line", label: "Straight Line" },
    ],
  },
  {
    name: "supplier_party_id",
    label: "Supplier",
    type: "lookup",
    lookup: "vendors",
  },
  {
    name: "cost_center_id",
    label: "Cost Centre",
    type: "lookup",
    lookup: "cost_centers",
  },
  {
    name: "notes",
    label: "Notes",
    type: "textarea",
    width: "full",
  },
]);

export function getFinanceFixedAssetFormContract(formId) {
  if (String(formId || "").trim().toLowerCase() !== "fixed-asset") return null;
  return FIXED_ASSET_FORM.map(field => ({ ...field }));
}
