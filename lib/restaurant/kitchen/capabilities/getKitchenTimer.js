export function getKitchenTimer(
  ticket,
  settings
) {

  const created =
    new Date(
      ticket.created_at ||
      ticket.createdAt
    ).getTime();

  const elapsed =
    Math.max(
      0,
      Math.floor(
        (Date.now() - created) / 1000
      )
    );

  const minutes =
    Math.floor(elapsed / 60);

  const seconds =
    elapsed % 60;

  if (!settings?.priorityLevels) {
    throw new Error(
      "Kitchen priorityLevels missing. Configure Restaurant Settings."
    );
  }

  const levels =
    settings.priorityLevels;

  let color =
    "text-green-400";

  if (minutes >= levels.warning)
    color = "text-yellow-400";

  if (minutes >= levels.urgent)
    color = "text-orange-400";

  if (minutes >= levels.critical)
    color = "text-red-500";

  return {
    elapsed,
    minutes,
    seconds,
    display:
      `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`,
    color,
  };

}
