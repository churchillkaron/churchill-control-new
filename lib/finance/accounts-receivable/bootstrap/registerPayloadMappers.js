import {
  registerPayloadMapper,
} from "@/lib/platform/payload-mappers/PayloadMapperRegistry";

import {
  mapCustomerInvoiceFormPayload,
} from "../mappers/customerInvoiceMapper";

registerPayloadMapper(
  "customerInvoice",
  mapCustomerInvoiceFormPayload,
);
