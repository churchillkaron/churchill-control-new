"use client";

import LayoutRenderer
from "../../components/marketing/LayoutRenderer";

export default function PosterPreview({
  poster,
  exportRef,
}){

  return (

    <div
  ref={exportRef}
      className="
        relative
        w-full
        h-[92vh]
        overflow-hidden
        rounded-3xl
        border
border-white/10
shadow-[0_0_120px_rgba(249,115,22,0.08)]
        bg-black
      "
    >

      {poster.selectedImage && (

        <img
          src={poster.selectedImage}
          alt=""
          className="
            absolute
            inset-0
            w-full
            h-full
            object-cover
          "
        />

      )}

      <div
        className="
          absolute
          inset-0
          bg-black/40
        "
      />

      <LayoutRenderer poster={poster} />

    </div>

  );
}