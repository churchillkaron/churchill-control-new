"use client";

import {
  useState,
} from "react";


export default function ChannelConnectionEngine({

  action,

  row,

  organizationId,

  onComplete,

}) {


  const [busy,setBusy] =
    useState(false);


  async function execute(){

    setBusy(true);


    try {

      if (
        action.engine === "channel_disconnect"
      ){

        await fetch(
          "/api/platform/channels/disconnect",
          {
            method:"POST",
            headers:{
              "Content-Type":"application/json",
            },
            body:JSON.stringify({

              organization_id:
                organizationId,

              provider:
                row.runtime,

            }),
          }
        );

      }


      if (
        action.engine === "channel_refresh"
      ){

        await fetch(
          "/api/platform/channels/refresh",
          {
            method:"POST",
            headers:{
              "Content-Type":"application/json",
            },
            body:JSON.stringify({

              organization_id:
                organizationId,

              provider:
                row.runtime,

            }),
          }
        );

      }


      if (
        action.engine === "channel_connect"
      ){

        const response =
          await fetch(
            `/api/platform/channels/oauth?runtime=${encodeURIComponent(row.runtime)}&organizationId=${encodeURIComponent(organizationId)}`
          );


        const json =
          await response.json();


        if (
          json.redirect
        ){

          window.location.href =
            json.redirect;

          return;

        }

      }


      onComplete?.();


    } finally {

      setBusy(false);

    }

  }



  return (

    <button

      onClick={execute}

      disabled={busy}

      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white"

    >

      {busy
        ? "Working..."
        : action.label
      }

    </button>

  );

}
