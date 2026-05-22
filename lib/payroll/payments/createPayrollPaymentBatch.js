export default function createPayrollPaymentBatch({

  payrollRecords = [],

  batchDate =
    new Date(),

}) {

  const batchId =
    `PAYROLL-BATCH-${Date.now()}`;

  const payments =
    payrollRecords.map(
      (record) => ({

        payroll_record_id:
          record.id,

        staff_id:
          record.staff_id,

        staff_name:
          record.staff_name,

        bank_name:
          record.bank_name,

        bank_account:
          record.bank_account,

        amount:
          Number(
            record.final_salary || 0
          ),

        currency:
          record.payroll_currency || "THB",

        payment_status:
          "PENDING",

      })
    );

  const totalAmount =
    payments.reduce(
      (sum, payment) =>
        sum +
        Number(
          payment.amount || 0
        ),
      0
    );

  return {

    batchId,

    batchDate:
      new Date(batchDate)
        .toISOString(),

    totalPayments:
      payments.length,

    totalAmount:
      Number(
        totalAmount.toFixed(2)
      ),

    payments,

  };

}
