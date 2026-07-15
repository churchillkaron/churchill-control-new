export function calculateAttendanceScore({

  lateMinutes = 0,

  overtimeHours = 0,

}) {

  const late =
    Number(
      lateMinutes || 0
    );

  const overtime =
    Number(
      overtimeHours || 0
    );

  let score = 100;

  // ===== LATE PENALTIES =====
  if (late >= 5) {
    score -= 5;
  }

  if (late >= 15) {
    score -= 10;
  }

  if (late >= 30) {
    score -= 20;
  }

  if (late >= 60) {
    score -= 40;
  }

  // ===== OVERTIME BONUS =====
  if (overtime >= 1) {
    score += 5;
  }

  if (overtime >= 3) {
    score += 5;
  }

  // ===== LIMITS =====
  if (score > 100) {
    score = 100;
  }

  if (score < 0) {
    score = 0;
  }

  return score;
}
