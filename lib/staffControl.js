// 🔥 STAFF PAYOUT CONTROL

export function setStaffMode(mode) {
  // mode: "bonus" | "normal" | "penalty"
  localStorage.setItem("ai_staff_mode", mode);
}

export function getStaffMode() {
  return localStorage.getItem("ai_staff_mode") || "normal";
}

export function getStaffMultiplier() {
  const mode = getStaffMode();

  if (mode === "bonus") return 1.2;   // +20%
  if (mode === "penalty") return 0.8; // -20%

  return 1; // normal
}

