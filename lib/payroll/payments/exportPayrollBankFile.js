export default function exportPayrollBankFile({

  paymentBatch = {},

}) {

  const rows = [

    [
      "Staff Name",
      "Bank Name",
      "Bank Account",
      "Amount",
      "Currency",
    ].join(","),

  ];

  for (
    const payment of
    paymentBatch.payments || []
  ) {

    rows.push(

      [

        payment.staff_name,

        payment.bank_name,

        payment.bank_account,

        payment.amount,

        payment.currency,

      ].join(",")

    );

  }

  return rows.join("\n");

}
