"use client";

import { useState }
from "react";

export default function
AssetLibraryPanel({

  assets = [],

  selectedBusiness,

  onSelectAsset,

  refreshAssets,

}) {

  const [
    activeType,
    setActiveType,
  ] = useState("all");

  const [
    search,
    setSearch,
  ] = useState("");

  // =====================================
  // BUSINESS FILTER
  // =====================================

  const businessAssets =

    selectedBusiness

      ? assets.filter(

          (asset) =>

            asset.page_id ===
            selectedBusiness

        )

      : assets;

  // =====================================
  // SEARCH + TYPE FILTER
  // =====================================

  const filteredAssets =

    businessAssets.filter(
      (asset) => {

        const matchesType =

          activeType === "all"

            ? true

            : asset.asset_type ===
              activeType;

        const searchLower =
          search.toLowerCase();

        const matchesSearch =

          !search

            ? true

            : (

                asset.name
                  ?.toLowerCase()
                  ?.includes(
                    searchLower
                  )

                ||

                asset.tags?.some(
                  (tag) =>

                    tag
                      ?.toLowerCase()
                      ?.includes(
                        searchLower
                      )
                )

                ||

                asset.analysis?.mood
                  ?.toLowerCase()
                  ?.includes(
                    searchLower
                  )

                ||

                asset.analysis?.sceneType
                  ?.toLowerCase()
                  ?.includes(
                    searchLower
                  )

              );

        return (
          matchesType &&
          matchesSearch
        );

      }
    );

  // =====================================
  // DELETE
  // =====================================

  async function deleteAsset(
    assetId
  ) {

    try {

      const confirmed =
        confirm(
          "Delete asset?"
        );

      if (!confirmed)
        return;

      await fetch(

        "/api/marketing/delete-asset",

        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json",

          },

          body: JSON.stringify({

            assetId,

          }),

        }

      );

      refreshAssets?.();

    } catch (err) {

      console.error(
        err
      );

      alert(
        "Delete failed"
      );

    }

  }

  // =====================================
  // UPDATE TYPE
  // =====================================

  async function updateAssetType({

    assetId,

    assetType,

  }) {

    try {

      await fetch(

        "/api/marketing/update-asset",

        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json",

          },

          body: JSON.stringify({

            assetId,

            assetType,

          }),

        }

      );

      refreshAssets?.();

    } catch (err) {

      console.error(
        err
      );

      alert(
        "Update failed"
      );

    }

  }

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

      {/* HEADER */}

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

      {/* SEARCH */}

      <input
        value={search}
        onChange={(e) =>
          setSearch(
            e.target.value
          )
        }
        placeholder="
          Search assets...
        "
        className="
          w-full
          mb-4
          bg-black/40
          border
          border-white/10
          rounded-xl
          p-3
          text-sm
          text-white
          placeholder:text-white/30
        "
      />

      {/* FILTERS */}

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
          "branding",
          "event",
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

      {/* GRID */}

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
            className="
              relative
              bg-black/30
              border
              border-white/10
              rounded-2xl
              overflow-hidden
              transition-all
              hover:border-orange-500/40
              group
            "
          >

            {/* IMAGE */}

            <div
              className="
                relative
                overflow-hidden
                aspect-square
                bg-black
              "
            >

              <img
                src={
                  asset.thumbnail_url ||
                  asset.image_url
                }
                alt={asset.name}
                loading="lazy"
                onClick={() => {

                  onSelectAsset?.(
                    asset
                  );

                }}
                className="
                  w-full
                  h-full
                  object-cover
                  cursor-pointer
                  transition
                  duration-300
                  group-hover:scale-105
                "
              />

            </div>

            {/* CONTENT */}

            <div
              className="
                p-3
                space-y-3
              "
            >

              {/* TITLE */}

              <div>

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
                    text-orange-400
                    text-[10px]
                    mt-1
                    uppercase
                    tracking-[0.15em]
                  "
                >
                  {asset.asset_type}
                </div>

                {asset.ai_suggested_type &&

                  asset.ai_suggested_type !==
                    asset.asset_type && (

                    <div
                      className="
                        text-yellow-400
                        text-[10px]
                        mt-1
                      "
                    >

                      AI Suggested:
                      {" "}

                      {
                        asset.ai_suggested_type
                      }

                    </div>

                )}

              </div>

              {/* STATS */}

              <div
                className="
                  flex
                  justify-between
                  text-[10px]
                "
              >

                <div
                  className="
                    text-orange-400
                  "
                >
                  Score:
                  {" "}
                  {asset.score || 0}
                </div>

                <div
                  className="
                    text-white/40
                  "
                >
                  Used:
                  {" "}
                  {asset.usage_count || 0}
                </div>

              </div>

              {/* ROLE */}

              {asset.analysis?.identity
                ?.hospitality_role && (

                <div
                  className="
                    text-cyan-400
                    text-[10px]
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

              {/* AI ANALYSIS */}

              {asset.analysis && (

                <div
                  className="
                    mt-3
                    space-y-1
                    text-[10px]
                    text-white/40
                  "
                >

                  {asset.analysis.mood && (

                    <div>

                      Mood:
                      {" "}

                      <span
                        className="
                          text-orange-300
                        "
                      >

                        {
                          asset.analysis.mood
                        }

                      </span>

                    </div>

                  )}

                  {asset.analysis.lighting && (

                    <div>

                      Lighting:
                      {" "}

                      <span
                        className="
                          text-orange-300
                        "
                      >

                        {
                          asset.analysis.lighting
                        }

                      </span>

                    </div>

                  )}

                  {asset.analysis.sceneType && (

                    <div>

                      Scene:
                      {" "}

                      <span
                        className="
                          text-orange-300
                        "
                      >

                        {
                          asset.analysis.sceneType
                        }

                      </span>

                    </div>

                  )}

                </div>

              )}

              {/* TAGS */}

              <div
                className="
                  flex
                  flex-wrap
                  gap-1
                "
              >

                {(asset.tags || [])
                  .slice(0, 4)
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

              {/* TYPE SELECT */}

              <select

                value={
                  asset.asset_type
                }

                onChange={(e) =>

                  updateAssetType({

                    assetId:
                      asset.id,

                    assetType:
                      e.target.value,

                  })

                }

                className="
                  w-full
                  bg-black/40
                  border
                  border-white/10
                  rounded-xl
                  p-2
                  text-xs
                "
              >

                <option value="staff">
                  Staff
                </option>

                <option value="venue">
                  Venue
                </option>

                <option value="cocktail">
                  Cocktail
                </option>

                <option value="food">
                  Food
                </option>

                <option value="interior">
                  Interior
                </option>

                <option value="branding">
                  Branding
                </option>

                <option value="event">
                  Event
                </option>

              </select>

              {/* ACTIONS */}

              <div
                className="
                  flex
                  gap-2
                "
              >

                <button

                  onClick={() =>

                    deleteAsset(
                      asset.id
                    )

                  }

                  className="
                    flex-1
                    bg-red-500/20
                    hover:bg-red-500/30
                    transition
                    rounded-xl
                    py-2
                    text-xs
                    text-red-300
                  "
                >
                  Delete
                </button>

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}