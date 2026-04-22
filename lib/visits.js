import { updateCustomerAfterVisit } from "./customers";

export function getVisits() {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem("visits")) || [];
}

export function saveVisits(data) {
  localStorage.setItem("visits", JSON.stringify(data));
}

export function saveVisit(data) {
  const existing = getVisits();

  const visit = {
    id: Date.now(),
    reservationId: data.reservationId,
    customerId: data.customerId,
    status: data.status,
    spend: data.spend || 0,
    hadDinner: data.hadDinner || false,
    hadDrinks: data.hadDrinks || false,
    playedGames: data.playedGames || false,
    liveMusic: data.liveMusic || false,
    staffId: data.staffId || null,
    createdAt: new Date().toISOString(),
  };

  const updated = [...existing, visit];
  saveVisits(updated);

  updateCustomerAfterVisit(visit.customerId, visit);

  return visit;
}