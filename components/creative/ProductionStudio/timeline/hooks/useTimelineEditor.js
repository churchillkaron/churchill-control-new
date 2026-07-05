"use client";

import { useCallback } from "react";

export function useTimelineEditor({

  organizationId,

  timelineId,

  onUpdated,

}) {

  const updateClip =
    useCallback(

      async (

        clipId,

        values,

      ) => {

        const response =
          await fetch(

            `/api/creative/timeline/clips/${clipId}`,

            {

              method: "PATCH",

              headers: {

                "Content-Type":
                  "application/json",

              },

              body:
                JSON.stringify({

                  organization_id:
                    organizationId,

                  timeline_id:
                    timelineId,

                  ...values,

                }),

            },

          );

        const json =
          await response.json();

        if (

          json.success &&

          onUpdated

        ) {

          onUpdated(

            json.clip,

          );

        }

        return json;

      },

      [

        organizationId,

        timelineId,

        onUpdated,

      ],

    );

  return {

    updateClip,

  };

}
