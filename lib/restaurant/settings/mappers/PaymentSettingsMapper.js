import {
  PaymentSettings,
} from "../documents/PaymentSettings";

export function mapPaymentSettings(
  row
){

  return new PaymentSettings({

    defaultMethodId:
      row.default_method_id,

    methods:
      row.methods,

  });

}
