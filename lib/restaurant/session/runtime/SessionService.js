import { executeCapability } from "@/lib/ubte/capabilities/executeCapability";

import * as OpenSession from "../OpenSession/execute";
import * as ChangeCustomer from "../ChangeCustomer/execute";

import * as GetActiveSession from "../GetActiveSession/execute";
import * as GetLiveSessionState from "../GetLiveSessionState/execute";
import * as LoadMergedSessionOrders from "../LoadMergedSessionOrders/execute";

const SESSION_ACTIONS = {
  open: {
    capabilityId: "restaurant.session.OpenSession",
    execute: OpenSession.execute,
  },
  changeCustomer: {
    capabilityId: "restaurant.session.ChangeCustomer",
    execute: ChangeCustomer.execute,
  },
  liveState: {
    capabilityId: "restaurant.session.GetLiveSessionState",
    execute: GetLiveSessionState.execute,
  },
  active: {
    capabilityId: "restaurant.session.GetActiveSession",
    execute: GetActiveSession.execute,
  },
  mergedOrders: {
    capabilityId: "restaurant.session.LoadMergedSessionOrders",
    execute: LoadMergedSessionOrders.execute,
  },
};

export async function executeSessionCommand({
  context,
  action,
  payload = {},
}) {
  if (!context?.organization_id) {
    throw new Error("organization_id required");
  }

  const command = SESSION_ACTIONS[action];

  if (!command) {
    throw new Error(`Unsupported Session action: ${action}`);
  }

  try {
    return await executeCapability({
      capabilityId: command.capabilityId,
      context,
      payload,
      executor: async () => {
        return command.execute({ context, payload });
      },
    });
  } catch (error) {
    if (
      String(error?.message || "").includes("capability not registered")
    ) {
      return command.execute({ context, payload });
    }

    throw error;
  }
}
