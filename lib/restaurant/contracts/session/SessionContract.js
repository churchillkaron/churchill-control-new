export const SessionContract = {
  document: "TableSession",

  capabilities: [
    "ChangeCustomer",
  ],

  events: [
    "restaurant.session.opened",
    "restaurant.session.closed",
    "restaurant.session.customer_changed",
    "restaurant.session.guests_changed",
  ],
};
