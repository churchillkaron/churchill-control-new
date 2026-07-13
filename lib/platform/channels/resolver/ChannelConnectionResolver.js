import {
  listByOrganization,
} from "../repositories/ChannelConnectionRepository";

import {
  listChannels,
} from "../ChannelRegistry";



export async function resolveOrganizationChannels({

  organization_id,

}) {


  const connections =
    await listByOrganization(
      organization_id
    );


  const channels =
    listChannels();



  return channels.map(channel => {


    const connection =
      connections.find(
        item =>
          item.provider === channel.runtime ||
          item.provider === channel.id
      );


    return {

      id:
        channel.id,

      name:
        channel.name,

      category:
        channel.type,

      runtime:
        channel.runtime,


      actions:
        channel.actions || [],


      capabilities:
        channel.capabilities || [],


      connected:
        Boolean(connection),


      status:
        connection?.status ||
        "NOT_CONNECTED",


      connection_id:
        connection?.id ||
        null,


      external_account_id:
        connection?.external_account_id ||
        null,


      external_asset_id:
        connection?.external_asset_id ||
        null,


      metadata:
        connection?.metadata ||
        {},

    };

  });

}
