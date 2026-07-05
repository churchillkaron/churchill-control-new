"use client";

import { useRef } from "react";

export function useTimelineDrag({

  updateClip,

}) {

  const dragging =
    useRef(null);

  function startDrag(

    clip,

    startX,

  ) {

    dragging.current = {

      clip,

      startX,

      original:
        clip.start_seconds,

    };

  }

  async function moveDrag(

    currentX,

  ) {

    if (!dragging.current)
      return;

    const delta =
      (currentX -
        dragging.current.startX) /
      20;

    const start =
      Math.max(

        0,

        dragging.current.original +
          delta,

      );

    await updateClip(

      dragging.current.clip.id,

      {

        start_seconds:
          Number(
            start.toFixed(2)
          ),

      },

    );

  }

  function endDrag() {

    dragging.current =
      null;

  }

  return {

    startDrag,

    moveDrag,

    endDrag,

  };

}
