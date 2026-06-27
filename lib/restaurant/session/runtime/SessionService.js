import { OpenSession } from "./actions/OpenSession";
import { CloseSession } from "./actions/CloseSession";
import { MoveGuests } from "./actions/MoveGuests";
import { SplitSessionGroup } from "./actions/SplitSessionGroup";

import { GetActiveSession } from "./queries/GetActiveSession";
import { GetLiveSessionState } from "./queries/GetLiveSessionState";
import { LoadMergedSessionOrders } from "./queries/LoadMergedSessionOrders";

export async function executeSessionCommand({
  organizationId,
  action,
  payload = {},
  actor = null,
}) {
  switch (action) {
    case "open":
      return OpenSession({
        organizationId,
        ...payload,
        actor,
      });

    case "close":
      return CloseSession({
        organizationId,
        ...payload,
        actor,
      });

    case "moveGuests":
      return MoveGuests({
        organizationId,
        ...payload,
        actor,
      });

    case "split":
      return SplitSessionGroup({
        organizationId,
        ...payload,
        actor,
      });

    case "liveState":
      return GetLiveSessionState({
        organizationId,
        ...payload,
      });

    case "active":
      return GetActiveSession({
        organizationId,
        ...payload,
      });

    case "mergedOrders":
      return LoadMergedSessionOrders({
        organizationId,
        ...payload,
      });

    default:
      throw new Error(
        `Unsupported Restaurant Session action: ${action}`
      );
  }
}
