import {
  BarTicketAggregate,
} from "@/lib/restaurant/aggregates/BarTicket/BarTicketAggregate";

export function fromRepository(ticket) {
  return new BarTicketAggregate(ticket);
}
