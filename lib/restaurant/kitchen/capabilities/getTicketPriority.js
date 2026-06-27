export function getTicketPriority(
  ticket,
  settings
) {

  const created =
    new Date(
      ticket.created_at ||
      ticket.createdAt
    ).getTime();

  const minutes =
    Math.floor(
      (Date.now() - created) / 60000
    );

  if (!settings?.priorityLevels) {
    throw new Error(
      "Kitchen priorityLevels missing. Configure Restaurant Settings."
    );
  }

  const levels =
    settings.priorityLevels;

  let priority =
    "NORMAL";

  if (minutes >= levels.warning)
    priority = "WARNING";

  if (minutes >= levels.urgent)
    priority = "URGENT";

  if (minutes >= levels.critical)
    priority = "CRITICAL";

  return {
    minutes,
    priority,
  };

}
