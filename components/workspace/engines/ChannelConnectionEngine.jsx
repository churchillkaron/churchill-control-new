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
        action.engine === "channel_provision"
      ){
        if (row.id !== "instagram") {
          throw new Error("Account provisioning is only available for supported channels");
        }

        const response = await fetch("/api/meta/provision-instagram", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_id: organizationId,
          }),
        });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error || "Instagram account provisioning failed");
        }

        if (json.status === "META_AUTHORIZATION_REQUIRED" && json.connect_url) {
          window.location.href = json.connect_url;
          return;
        }

        const handoffUrl = json.handoff?.url;
        const continuationUrl = json.continuation?.url;
        if (!handoffUrl || !continuationUrl) {
          throw new Error("Instagram provisioning handoff is unavailable");
        }

        window.open(handoffUrl, "_blank", "noopener,noreferrer");
        const completed = window.confirm(
          "Instagram requires account ownership and identity verification on its own secure screen. Complete the new Professional account there, then press OK and Avantiqo will connect and discover it automatically."
        );
        if (completed) {
          window.location.href = continuationUrl;
          return;
        }
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
