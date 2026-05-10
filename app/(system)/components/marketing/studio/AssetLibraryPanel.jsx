"use client";

import { useState }
from "react";

export default function
AssetLibraryPanel({

  assets = [],

  onSelectAsset,

}) {

  const [
    activeType,
    setActiveType,
  ] = useState("all");

  const filteredAssets =

    activeType === "all"

      ? assets

      : assets.filter(
          (asset) =>

            asset.asset_type ===
            activeType
        );

  return (

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
          mb-5
        "
      >
        Asset Library
      </div>

      <div
        className="
          flex
          gap-2
          mb-4
          overflow-x-auto
        "
      >

        {[
          "all",
          "staff",
          "venue",
          "cocktail",
          "food",
          "interior",
        ].map((type) => (

          <button
            key={type}
            onClick={() =>
              setActiveType(type)
            }
            className={`
              px-3
              py-2
              rounded-xl
              text-xs
              uppercase
              shrink-0

              ${
                activeType === type
                  ? "bg-orange-500 text-white"
                  : "bg-black/30 text-white/60"
              }
            `}
          >
            {type}
          </button>

        ))}

      </div>

      <div
        className="
          grid
          grid-cols-2
          gap-3
        "
      >

        {filteredAssets.map((asset) => (

          <div
            key={asset.id}

            onClick={() => {

              if (onSelectAsset) {

                onSelectAsset(asset);

              }

            }}

            className="
              bg-black/30
              border
              border-white/10
              rounded-xl
              overflow-hidden
              cursor-pointer
              hover:border-orange-500/40
              transition-all
            "
          >

            <img
              src={asset.image_url}
              alt={asset.name}
              className="
                w-full
                h-32
                object-cover
              "
            />

            <div className="p-3">

              <div
                className="
                  text-white
                  text-sm
                  truncate
                "
              >
                {asset.name}
              </div>

              <div
                className="
                  text-white/50
                  text-xs
                  mt-1
                "
              >
                {asset.asset_type}
              </div>

              <div
  className="
    text-orange-400
    text-[10px]
    mt-1
  "
>
  Score: {asset.score || 0}
</div>
<div
  className="
    text-white/40
    text-[10px]
    mt-1
  "
>
  Used: {asset.usage_count || 0}
</div>
{asset.analysis?.identity
  ?.hospitality_role && (

    

    
  <div
    className="
      text-cyan-400
      text-[10px]
      mt-1
      uppercase
      tracking-[0.15em]
    "
  >
    {
      asset.analysis
        .identity
        .hospitality_role
    }
  </div>

)}
              <div
                className="
                  flex
                  flex-wrap
                  gap-1
                  mt-2
                "
              >

                {(asset.tags || [])
                  .slice(0, 3)
                  .map((tag) => (

                    <div
                      key={tag}
                      className="
                        text-[10px]
                        px-2
                        py-1
                        rounded-full
                        bg-orange-500/20
                        text-orange-300
                      "
                    >
                      {tag}
                    </div>

                ))}

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}