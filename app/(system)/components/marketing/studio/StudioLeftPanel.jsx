"use client";

import ControlPanel
from "../ControlPanel";

import { uploadMarketingAsset }
from "@/lib/supabase/uploadMarketingAsset";

export default function StudioLeftPanel({

  poster,

}) {

  const tenantId =
    "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  return (

    <div
      className="
        absolute
        left-8
        top-8
        bottom-8
        w-[260px]
        bg-white/[0.03]
        backdrop-blur-2xl
        rounded-[32px]
        p-6
        overflow-auto
        z-20
      "
    >

      <div
        className="
          text-orange-500
          uppercase
          tracking-[0.3em]
          text-xs
          mb-6
        "
      >
        Creative Direction
      </div>

      {poster.engine ===
        "enhance" && (

        <div
          className="
            mb-6
            bg-white/5
            border
            border-white/10
            rounded-2xl
            p-5
          "
        >

          <div
            className="
              text-orange-500
              uppercase
              tracking-[0.2em]
              text-xs
              mb-4
            "
          >
            Venue Assets
          </div>

          <input
            type="file"
            multiple
            accept="image/*"
            onChange={async (e) => {

  const files =
    Array.from(
      e.target.files || []
    );

  poster.setInteriorImages(
    files
  );

  for (const file of files) {

    await uploadMarketingAsset({

      file,

      tenantId,

      assetType:
        "interior",

    });

  }

}}
            className="
              w-full
              bg-black/40
              border
              border-white/10
              rounded-xl
              p-4
            "
          />

          {poster.interiorImages
            ?.length > 0 && (

            <div
              className="
                grid
                grid-cols-3
                gap-3
                mt-5
              "
            >

              {poster.interiorImages.map(
                (file, index) => (

                  <img
                    key={index}
                    src={URL.createObjectURL(file)}
                    alt=""
                    className="
                      w-full
                      h-24
                      object-cover
                      rounded-xl
                    "
                  />

                )
              )}

            </div>

          )}

        </div>

      )}

      {poster.engine ===
        "composite" && (

        <div className="space-y-5 mb-6">

          <div
            className="
              bg-white/5
              border
              border-white/10
              rounded-2xl
              p-5
            "
          >

            <div
              className="
                text-orange-500
                uppercase
                tracking-[0.2em]
                text-xs
                mb-4
              "
            >
              Staff Images
            </div>

            <input
              type="file"
              multiple
              accept="image/*"
              onChange={async (e) => {

  const files =
    Array.from(
      e.target.files || []
    );

  poster.setStaffImages(
    files
  );

  for (const file of files) {

    await uploadMarketingAsset({

      file,

      tenantId,

      assetType:
        "staff",

    });

  }

}}
              className="
                w-full
                bg-black/40
                border
                border-white/10
                rounded-xl
                p-4
              "
            />

            {poster.staffImages
              ?.length > 0 && (

              <div
                className="
                  grid
                  grid-cols-3
                  gap-3
                  mt-5
                "
              >

                {poster.staffImages.map(
                  (file, index) => (

                    <img
                      key={index}
                      src={URL.createObjectURL(file)}
                      alt=""
                      className="
                        w-full
                        h-24
                        object-cover
                        rounded-xl
                      "
                    />

                  )
                )}

              </div>

            )}

          </div>

          <div
            className="
              bg-white/5
              border
              border-white/10
              rounded-2xl
              p-5
            "
          >

            <div
              className="
                text-orange-500
                uppercase
                tracking-[0.2em]
                text-xs
                mb-4
              "
            >
              Interior Images
            </div>

            <input
              type="file"
              multiple
              accept="image/*"
              onChange={async (e) => {

  const files =
    Array.from(
      e.target.files || []
    );

  poster.setInteriorImages(
    files
  );

  for (const file of files) {

    await uploadMarketingAsset({

      file,

      tenantId,

      assetType:
        "interior",

    });

  }

}}
              className="
                w-full
                bg-black/40
                border
                border-white/10
                rounded-xl
                p-4
              "
            />

          </div>

        </div>

      )}

      <ControlPanel
        poster={poster}
      />

    </div>

  );

}