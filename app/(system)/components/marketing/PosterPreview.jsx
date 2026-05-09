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
        h-[900px]
        overflow-hidden
        rounded-3xl
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