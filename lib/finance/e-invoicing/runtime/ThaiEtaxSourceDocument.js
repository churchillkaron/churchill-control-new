import crypto from "node:crypto";

const text = (value) => String(value ?? "").trim();
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = (value) => number(value).toFixed(2);
const esc = (value) => text(value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const date102 = (value) => {
  const date = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replace(/-/g, "") : "";
};
const issue = (code, field, message) => ({ code, field, message });

export function preflightThaiEtaxInvoice({ invoice, lines = [], seller, buyer, setting } = {}) {
  const blockers = [];
  if (!invoice?.id) blockers.push(issue("INVOICE_REQUIRED", "invoice", "Customer invoice is required."));
  if (!text(invoice?.invoice_number)) blockers.push(issue("INVOICE_NUMBER_REQUIRED", "invoice_number", "Invoice number is required."));
  if (!date102(invoice?.invoice_date)) blockers.push(issue("INVOICE_DATE_REQUIRED", "invoice_date", "Invoice date is required."));
  if (!text(invoice?.currency_code)) blockers.push(issue("CURRENCY_REQUIRED", "currency_code", "Invoice currency is required."));
  if (!(number(invoice?.total_amount) > 0)) blockers.push(issue("TOTAL_REQUIRED", "total_amount", "Invoice total must be greater than zero."));
  if (!lines.length) blockers.push(issue("LINES_REQUIRED", "lines", "At least one invoice line is required."));
  lines.forEach((line, index) => {
    if (!text(line?.description)) blockers.push(issue("LINE_DESCRIPTION_REQUIRED", `lines.${index}.description`, `Line ${index + 1} requires a description.`));
    if (!(number(line?.quantity) > 0)) blockers.push(issue("LINE_QUANTITY_REQUIRED", `lines.${index}.quantity`, `Line ${index + 1} requires a positive quantity.`));
    if (number(line?.unit_price) < 0) blockers.push(issue("LINE_PRICE_INVALID", `lines.${index}.unit_price`, `Line ${index + 1} has an invalid unit price.`));
    if (number(line?.tax_amount) > 0 && !text(line?.tax_rule_id || line?.tax_code)) blockers.push(issue("LINE_TAX_EVIDENCE_REQUIRED", `lines.${index}.tax_rule_id`, `Line ${index + 1} charges tax but has no governed tax rule evidence.`));
  });  if (!text(seller?.legal_name || seller?.display_name)) blockers.push(issue("SELLER_NAME_REQUIRED", "seller.legal_name", "Seller legal name is required."));
  if (!text(seller?.tax_id)) blockers.push(issue("SELLER_TAX_ID_REQUIRED", "seller.tax_id", "Seller tax ID is required for Thai e-Tax."));
  if (!text(seller?.address)) blockers.push(issue("SELLER_ADDRESS_REQUIRED", "seller.address", "Seller registered address is required for Thai e-Tax."));
  if (text(seller?.country).toUpperCase() !== "TH") blockers.push(issue("SELLER_COUNTRY_UNSUPPORTED", "seller.country", "This Thai e-Tax profile requires a Thailand legal entity."));
  if (!text(buyer?.legal_name || buyer?.display_name)) blockers.push(issue("BUYER_NAME_REQUIRED", "buyer.legal_name", "Customer legal/display name is required."));
  if (!text(buyer?.tax_id)) blockers.push(issue("BUYER_TAX_ID_REQUIRED", "buyer.tax_id", "Customer tax ID is required for a Thai e-Tax invoice."));
  if (!text(buyer?.address)) blockers.push(issue("BUYER_ADDRESS_REQUIRED", "buyer.address", "Customer billing address is required for a Thai e-Tax invoice."));
  if (text(setting?.jurisdiction_code).toUpperCase() !== "TH") blockers.push(issue("JURISDICTION_MISMATCH", "setting.jurisdiction_code", "Active e-invoice profile must use TH jurisdiction."));
  if (text(setting?.document_type).toUpperCase() !== "CUSTOMER_INVOICE") blockers.push(issue("DOCUMENT_TYPE_MISMATCH", "setting.document_type", "Active e-invoice profile must support customer invoices."));
  const subtotal = lines.reduce((sum, line) => sum + number(line.line_total ?? (number(line.quantity) * number(line.unit_price) - number(line.discount_amount))), 0);
  const tax = lines.reduce((sum, line) => sum + number(line.tax_amount), 0);
  if (Math.abs(subtotal - number(invoice?.subtotal)) > 0.01) blockers.push(issue("SUBTOTAL_MISMATCH", "subtotal", "Invoice subtotal does not match its line evidence."));
  if (Math.abs(tax - number(invoice?.tax_amount)) > 0.01) blockers.push(issue("TAX_TOTAL_MISMATCH", "tax_amount", "Invoice tax total does not match its line evidence."));
  if (Math.abs(number(invoice?.subtotal) + number(invoice?.tax_amount) - number(invoice?.total_amount)) > 0.01) blockers.push(issue("GRAND_TOTAL_MISMATCH", "total_amount", "Invoice grand total is inconsistent."));
  const status = text(invoice?.status).toUpperCase();
  if (["CANCELLED", "CANCELED", "VOID", "VOIDED", "REVERSED", "DRAFT"].includes(status)) blockers.push(issue("INVOICE_STATUS_NOT_TRANSMITTABLE", "status", `Invoice status ${status || "UNKNOWN"} cannot be transmitted.`));
  return { ready: blockers.length === 0, blockers };
}

function partyXml(tag, party, country = "TH") {
  const lines = text(party.address).split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean);
  return `<ram:${tag}><ram:Name>${esc(party.legal_name || party.display_name)}</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="TXID">${esc(party.tax_id)}</ram:ID></ram:SpecifiedTaxRegistration><ram:PostalTradeAddress>${lines.map((line) => `<ram:LineOne>${esc(line)}</ram:LineOne>`).join("")}<ram:CountryID>${esc(country)}</ram:CountryID></ram:PostalTradeAddress></ram:${tag}>`;
}function lineXml(line, index, currency) {
  const quantity = number(line.quantity);
  const unitPrice = number(line.unit_price);
  const net = number(line.line_total ?? (quantity * unitPrice - number(line.discount_amount)));
  const tax = number(line.tax_amount);
  const rawRate = number(line.tax_rate);
  const rate = rawRate > 0 && rawRate <= 1 ? rawRate * 100 : rawRate;
  const taxXml = tax > 0
    ? `<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:RateApplicablePercent>${rate.toFixed(2)}</ram:RateApplicablePercent><ram:CalculatedAmount currencyID="${esc(currency)}">${money(tax)}</ram:CalculatedAmount></ram:ApplicableTradeTax>`
    : "";
  return `<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:LineID>${index + 1}</ram:LineID></ram:AssociatedDocumentLineDocument><ram:SpecifiedTradeProduct><ram:Name>${esc(line.description)}</ram:Name></ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:GrossPriceProductTradePrice><ram:ChargeAmount currencyID="${esc(currency)}">${money(unitPrice)}</ram:ChargeAmount></ram:GrossPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${quantity}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement>${taxXml}<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount currencyID="${esc(currency)}">${money(net)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`;
}

export function buildThaiEtaxCrossIndustryInvoiceXml({ invoice, lines = [], seller, buyer, setting } = {}) {
  const preflight = preflightThaiEtaxInvoice({ invoice, lines, seller, buyer, setting });
  if (!preflight.ready) {
    const error = new Error("E_INVOICE_PREFLIGHT_BLOCKED");
    error.code = "E_INVOICE_PREFLIGHT_BLOCKED";
    error.blockers = preflight.blockers;
    throw error;
  }
  const currency = text(invoice.currency_code).toUpperCase();
  const taxTotal = number(invoice.tax_amount);
  const taxXml = taxTotal > 0
    ? `<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount currencyID="${esc(currency)}">${money(invoice.subtotal)}</ram:BasisAmount><ram:CalculatedAmount currencyID="${esc(currency)}">${money(taxTotal)}</ram:CalculatedAmount></ram:ApplicableTradeTax>`
    : "";
  const body = lines.map((line, index) => lineXml(line, index, currency)).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rsm:TaxInvoice_CrossIndustryInvoice xmlns:rsm="urn:etda:uncefact:data:standard:CrossIndustryInvoice:2" xmlns:ram="urn:etda:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:2" xmlns:udt="urn:etda:uncefact:data:standard:UnqualifiedDataType:2"><rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${esc(setting.standard_code || "ETDA_CII")}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext><rsm:ExchangedDocument><ram:ID>${esc(invoice.invoice_number)}</ram:ID><ram:TypeCode>388</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${date102(invoice.invoice_date)}</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument><rsm:SupplyChainTradeTransaction>${body}<ram:ApplicableHeaderTradeAgreement>${partyXml("SellerTradeParty", seller, "TH")}${partyXml("BuyerTradeParty", buyer, buyer.country || "TH")}</ram:ApplicableHeaderTradeAgreement><ram:ApplicableHeaderTradeDelivery/><ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>${esc(currency)}</ram:InvoiceCurrencyCode>${taxXml}<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount currencyID="${esc(currency)}">${money(invoice.subtotal)}</ram:LineTotalAmount><ram:TaxBasisTotalAmount currencyID="${esc(currency)}">${money(invoice.subtotal)}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="${esc(currency)}">${money(taxTotal)}</ram:TaxTotalAmount><ram:GrandTotalAmount currencyID="${esc(currency)}">${money(invoice.total_amount)}</ram:GrandTotalAmount><ram:DuePayableAmount currencyID="${esc(currency)}">${money(invoice.outstanding_amount ?? invoice.outstanding_balance ?? invoice.total_amount)}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:TaxInvoice_CrossIndustryInvoice>`;
  return { xml, source_hash: crypto.createHash("sha256").update(xml).digest("hex"), preflight };
}