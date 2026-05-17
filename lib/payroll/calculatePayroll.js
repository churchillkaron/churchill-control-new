export function calculatePayroll({

  baseSalary = 0,

  totalHours = 0,

  overtimeHours = 0,

  attendanceScore = 100,

  serviceChargeBonus = 0,

}) {

  const salary =
    Number(baseSalary || 0);

  const hours =
    Number(totalHours || 0);

  const overtime =
    Number(overtimeHours || 0);

  const score =
    Number(attendanceScore || 0);

  const serviceBonus =
    Number(
      serviceChargeBonus || 0
    );

  // ===== OVERTIME =====
  const hourlyRate =
    salary / 30 / 8;

  const overtimePay =
    overtime *
    hourlyRate *
    1.5;

  // ===== ATTENDANCE DEDUCTIONS =====
  let deductions = 0;

  if (score < 90) {
    deductions +=
      salary * 0.05;
  }

  if (score < 70) {
    deductions +=
      salary * 0.1;
  }

  if (score < 50) {
    deductions +=
      salary * 0.15;
  }

  // ===== FINAL =====
  const finalSalary =
    salary +
    overtimePay +
    serviceBonus -
    deductions;

  return {

    totalHours: hours,

    overtimeHours:
      Number(
        overtime.toFixed(2)
      ),

    attendanceScore:
      Number(
        score.toFixed(2)
      ),

    baseSalary:
      Number(
        salary.toFixed(2)
      ),

    overtimePay:
      Number(
        overtimePay.toFixed(2)
      ),

    serviceChargeBonus:
      Number(
        serviceBonus.toFixed(2)
      ),

    deductions:
      Number(
        deductions.toFixed(2)
      ),

    finalSalary:
      Number(
        finalSalary.toFixed(2)
      ),
  };
}
