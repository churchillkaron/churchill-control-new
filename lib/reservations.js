import { findOrCreateCustomer } from "./customers";

export function getReservations() {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem("reservations")) || [];
}

export function saveReservations(data) {
  localStorage.setItem("reservations", JSON.stringify(data));
}

export function saveReservation(data) {
  const existing = getReservations();

  // 🔥 CONNECT TO CUSTOMER
  const customer = findOrCreateCustomer(data.name, data.phone);

  const newReservation = {
    id: Date.now(),

    // CUSTOMER LINK
    customerId: customer.id,

    // BASIC INFO
    name: data.name,
    phone: data.phone,
    guests: data.guests,
    date: data.date,
    time: data.time,
    notes: data.notes || "",

    // SYSTEM
    status: "pending",
    source: "website",

    table: null,
    assignedStaff: null,

    createdAt: new Date().toISOString(),
  };

  const updated = [...existing, newReservation];
  saveReservations(updated);

  return newReservation;
}

export function updateReservation(id, updates) {
  const reservations = getReservations();

  const updated = reservations.map((r) =>
    r.id === id ? { ...r, ...updates } : r
  );

  saveReservations(updated);
}