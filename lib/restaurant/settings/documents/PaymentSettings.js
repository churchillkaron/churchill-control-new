export class PaymentSettings {

  constructor(data = {}) {

    this.defaultMethodId =
      data.default_method_id;

    this.methods =
      data.methods || [];

  }

}
