"use client";

import { useCallback } from "react";

export function useAssetTimeline({

  organizationId,

  projectId,

  timelineId,

  trackId,

  onCreated,

}) {

  const addToTimeline =
    useCallback(

      async (asset) => {

        const response =
          await fetch(

            "/api/creative/timeline/clips/from-asset",

            {

              method: "POST",

              headers: {

                "Content-Type":
                  "application/json",

              },

              body:
                JSON.stringify({

                  organization_id:
                    organizationId,

                  creative_project_id:
                    projectId,

                  timeline_id:
                    timelineId,

                  track_id:
                    trackId,

                  asset_id:
                    asset.id,

                  start_seconds: 0,

                  end_seconds: 5,

                }),

            },

          );

        const json =
          await response.json();

        if (

          json.success &&

          onCreated

        ) {

          onCreated(

            json.clip,

          );

        }

        return json;

      },

      [

        organizationId,

        projectId,

        timelineId,

        trackId,

        onCreated,

      ],

    );

  return {

    addToTimeline,

  };

}
