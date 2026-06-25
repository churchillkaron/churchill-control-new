import {
  KitchenTicketAggregate,
} from "@/lib/restaurant/aggregates/KitchenTicket/KitchenTicketAggregate";

export function fromRepository(ticket) {
  return new KitchenTicketAggregate(ticket);
}
