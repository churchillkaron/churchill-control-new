// 🔥 AI CONTROL FLAGS (SYSTEM BEHAVIOR)

export function setControlFlag(key, value) {
  const flags = JSON.parse(localStorage.getItem("ai_control") || "{}");
  flags[key] = value;
  localStorage.setItem("ai_control", JSON.stringify(flags));
}

export function getControlFlag(key) {
  const flags = JSON.parse(localStorage.getItem("ai_control") || "{}");
  return flags[key];
}

export function clearControlFlags() {
  localStorage.setItem("ai_control", JSON.stringify({}));
}