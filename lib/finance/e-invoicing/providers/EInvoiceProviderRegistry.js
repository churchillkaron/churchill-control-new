import CertifiedEtaxRestProvider from "./CertifiedEtaxRestProvider";

const providers = new Map([
  [CertifiedEtaxRestProvider.id, CertifiedEtaxRestProvider],
  ["netbay_invoicechain", CertifiedEtaxRestProvider],
  ["inet_etax", CertifiedEtaxRestProvider],
]);
export function getEInvoiceProvider(providerCode) {
  const key = String(providerCode || "").trim().toLowerCase();
  const provider = providers.get(key);
  if (!provider) throw new Error(`E_INVOICE_PROVIDER_UNSUPPORTED:${key || "missing"}`);
  return provider;
}
