export const hotelRuntime = {
  id: "hotel",
  name: "Hotel",
  modules: [
    { id: "pos", name: "POS", category: "Core" },
    { id: "reservations", name: "Reservations", category: "Core" },
    { id: "housekeeping", name: "Housekeeping", category: "Core" },
    { id: "frontdesk", name: "Front Desk", category: "Core" }
  ],
  dashboards: [
    { id: "revenue", name: "Revenue" },
    { id: "occupancy", name: "Occupancy" },
    { id: "staff", name: "Staff" }
  ]};
