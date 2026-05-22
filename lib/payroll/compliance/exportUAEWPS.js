export default function exportUAEWPS({

  payrollRecords = [],

}) {

  const rows = [

    [
      "Employee Name",
      "Bank Account",
      "Salary",
      "Currency",
    ].join(","),

  ];

  for (
    const record of
    payrollRecords
  ) {

    rows.push(

      [

        record.staff_name,

        record.bank_account || "",

        Number(
          record.final_salary || 0
        ),

        record.payroll_currency || "AED",

      ].join(",")

    );

  }

  return rows.join("\n");

}
