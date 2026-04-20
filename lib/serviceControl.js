// 🔥 SERVICE CHARGE CONTROL

export function setServiceLevel(level) {
  localStorage.setItem("ai_service_level", level.toString());
}

export function getServiceLevel() {
  return Number(localStorage.getItem("ai_service_level") || 5);
}