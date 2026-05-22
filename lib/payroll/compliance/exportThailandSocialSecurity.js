export default function exportThailandSocialSecurity({

  payrollRecords = [],

}) {

  const rows = [

    [
      "Employee Name",
      "Social Security ID",
      "Monthly Salary",
      "Social Security Contribution",
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
          record.social_security || 0
        ),

      ].join(",")

    );

  }

  return rows.join("\n");

}
