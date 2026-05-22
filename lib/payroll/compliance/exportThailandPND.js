export default function exportThailandPND({

  payrollRecords = [],

}) {

  const rows = [

    [
      "Employee Name",
      "Tax ID",
      "Gross Salary",
      "Tax Amount",
      "Social Security",
      "Net Salary",
    ].join(","),

  ];

  for (
    const record of
    payrollRecords
  ) {

    rows.push(

      [

        record.staff_name,

        record.tax_id || "",

        Number(
          record.gross_salary || 0
        ),

        Number(
          record.tax_amount || 0
        ),

        Number(
          record.social_security || 0
        ),

        Number(
          record.final_salary || 0
        ),

      ].join(",")

    );

  }

  return rows.join("\n");

}
