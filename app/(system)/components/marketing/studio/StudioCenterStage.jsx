"use client";

import PosterPreview
from "../PosterPreview";

export default function StudioCenterStage({

  poster,

  exportRef,

}) {

  return (

    <div
      className="
        relative
        h-full
        flex
        items-center
        justify-center
        px-[320px]
      "
    >

      <div
        className="
          absolute
          inset-0
          bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.08),transparent_60%)]
        "
      />

      <div
        className="
          absolute
          top-8
          left-1/2
          -translate-x-1/2
          z-30
          flex
          items-center
          gap-3
        "
      >

        <div
          className="
            bg-black/60
            border
            border-orange-500/20
            px-5
            py-3
            rounded-full
            text-xs
            uppercase
            tracking-[0.3em]
            text-orange-400
          "
        >
          Live Campaign
        </div>

        <div
          className="
            bg-green-500/20
            border
            border-green-500/20
            px-5
            py-3
            rounded-full
            text-xs
            uppercase
            tracking-[0.3em]
            text-green-400
          "
        >
          AI Render
        </div>

      </div>

      <div
        className="
          w-full
          max-w-[1400px]
          h-full
          flex
          items-center
          justify-center
        "
      >

        <PosterPreview
          poster={poster}
          exportRef={exportRef}
        />

      </div>

    </div>

  );

}