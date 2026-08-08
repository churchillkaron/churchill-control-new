export const SessionContract = {

  document: "TableSession",

  aggregate: "SessionAggregate",

  repository: "SessionRepository",

  applicationService:
    "SessionApplicationService",

  capabilities: [

    "OpenSession",

    "ChangeCustomer",

    "MoveGuests",

    "SplitSessionGroup",

  ],

  events: [

    "restaurant.session.opened",

    "restaurant.session.closed",

    "restaurant.session.customer_changed",

    "restaurant.session.guests_changed",

  ],

};
