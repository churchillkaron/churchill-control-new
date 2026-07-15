import {
  mapCustomerInvoiceFormPayload,
} from "@/lib/finance/accounts-receivable/mappers/customerInvoiceMapper";

const REGISTRY = {

  customerInvoice:
    mapCustomerInvoiceFormPayload,

};

export function resolvePayloadMapper(name) {

  if (!name) {
    return null;
  }

  return REGISTRY[name] || null;

}
