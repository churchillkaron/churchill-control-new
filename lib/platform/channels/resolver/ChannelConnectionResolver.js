import {
  listByOrganization,
} from "../repositories/ChannelConnectionRepository";

import {
  listChannels,
} from "../ChannelRegistry";

import {
  ChannelAssetRuntime,
} from "../runtime/ChannelAssetRuntime";

import {
  resolveChannelOAuthRoute,
} from "./ChannelOAuthResolver";



export async function resolveOrganizationChannels({

  organization_id,

}) {


  const connections =
    await listByOrganization(
      organization_id
    );


  const channels =
    listChannels();



  return Promise.all(
    channels.map(async channel => {


    const connection =
      connections.find(
        item =>
          item.provider === channel.runtime ||
          item.provider === channel.id
      );


    const assets =
      connection
        ? await ChannelAssetRuntime.list({

            organization_id,

            connection_id:
              connection.id,

          })
        : [];


    const actions =
      (channel.actions || [])
        .filter(action =>
          action.engine !== "channel_connect" ||
          Boolean(
            resolveChannelOAuthRoute({
              runtime: channel.runtime,
            })
          )
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


      actions,


      capabilities:
        Array.isArray(channel.capabilities)
          ? channel.capabilities
          : [],


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


      assets,


    };

  }));



}
