export default function reconcilePayrollPayments({

  paymentBatch = {},

  successfulPayments = [],

}) {

  const reconciled =
    paymentBatch.payments.map(
      payment => {

        const matched =
          successfulPayments.find(
            p =>
              p.payroll_record_id ===
              payment.payroll_record_id
          );

        return {

          ...payment,

          reconciled:
            !!matched,

          payment_status:
            matched
              ? "PAID"
              : "FAILED",

        };

      }
    );

  return {

    batchId:
      paymentBatch.batchId,

    reconciledPayments:
      reconciled,

    paidCount:
      reconciled.filter(
        p => p.reconciled
      ).length,

    failedCount:
      reconciled.filter(
        p => !p.reconciled
      ).length,

  };

}
