export const KitchenContract = {

  document: "KitchenTicket",

  aggregate: "KitchenTicketAggregate",

  repository: "KitchenTicketRepository",

  applicationService:
    "KitchenApplicationService",

  capabilities: [

    "CreateKitchenTicket",

    "StartPreparation",

    "MarkReady",

    "Complete",

  ],

  events: [

    "restaurant.kitchen.ticket.created",

    "restaurant.kitchen.started",

    "restaurant.kitchen.ready",

    "restaurant.kitchen.completed",

  ],

};
