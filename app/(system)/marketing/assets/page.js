"use client";

import { useEffect, useState }
from "react";

export default function MarketingAssetsPage() {

  const [

    assets,

    setAssets,

  ] = useState([]);

  const [

    loading,

    setLoading,

  ] = useState(true);

  useEffect(() => {

    loadAssets();

  }, []);

  async function loadAssets() {

    try {

      const response =
        await fetch(
          "/api/marketing/assets"
        );

      const data =
        await response.json();

      setAssets(
        data.assets || []
      );

    } catch (err) {

      console.error(
        "LOAD ASSETS ERROR:",
        err
      );

    } finally {

      setLoading(false);

    }

  }

  if (loading) {

    return (

      <div className="text-white/60">

        Loading assets...

      </div>

    );

  }

  return (

    <div className="space-y-8">

      <div>

        <h1
          className="
            text-3xl
            font-bold
            text-white
          "
        >

          AI Asset Library

        </h1>

        <div
          className="
            text-white/50
            mt-2
          "
        >

          Uploaded, generated,
          and enhanced marketing visuals.

        </div>

      </div>

      <div
        className="
          grid
          grid-cols-1
          md:grid-cols-2
          xl:grid-cols-4
          gap-6
        "
      >

        {assets.map((asset) => (

          <div

            key={asset.id}

            className="
              bg-white/5
              border
              border-white/10
              rounded-2xl
              overflow-hidden
            "

          >

            <img

              src={asset.file_url}

              alt="Asset"

              className="
                w-full
                h-56
                object-cover
              "

            />

            <div className="p-4">

              <div
                className="
                  text-sm
                  uppercase
                  tracking-[0.15em]
                  text-white/40
                "
              >

                {asset.asset_type}

              </div>

              <div
                className="
                  mt-3
                  flex
                  flex-wrap
                  gap-2
                "
              >

                {(asset.tags || [])
                  .map((tag) => (

                    <div

                      key={tag}

                      className="
                        px-2
                        py-1
                        rounded-full
                        bg-orange-500/20
                        text-orange-300
                        text-xs
                      "

                    >

                      {tag}

                    </div>

                ))}

              </div>

              <div
                className="
                  mt-4
                  text-xs
                  text-white/40
                "
              >

                Provider:
                {" "}
                {asset.provider || "-"}

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}