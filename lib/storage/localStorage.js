// lib/storage.js

export function getHistoryDays() {
  if (typeof window === "undefined") return []
  const data = localStorage.getItem("history_days")
  return data ? JSON.parse(data) : []
}

export function saveHistoryDay(day) {
  if (typeof window === "undefined") return

  const existing = getHistoryDays()
  const updated = [...existing, day]

  localStorage.setItem("history_days", JSON.stringify(updated))
}