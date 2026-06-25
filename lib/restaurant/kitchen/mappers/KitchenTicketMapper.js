import {
  KitchenTicketAggregate,
} from "@/lib/restaurant/aggregates/KitchenTicket/KitchenTicketAggregate";

export function fromRepository(ticket) {
  return new KitchenTicketAggregate({
    ...ticket,
    organizationId: ticket.organization_id,
    orderId: ticket.order_id,
    sessionId: ticket.session_id,
    tableId: ticket.table_id,
    tableNumber: ticket.table_number,
    startedAt: ticket.started_at,
    readyAt: ticket.ready_at,
    completedAt: ticket.completed_at,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
  });
}
