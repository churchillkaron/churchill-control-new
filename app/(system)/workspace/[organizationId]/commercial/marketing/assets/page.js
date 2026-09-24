"use client";

export const dynamic = "force-dynamic";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState }
from "react";

export default function MarketingAssetsPage() {

  const params = useParams();
  const organizationId = String(params?.organizationId || "");

  const [

    assets,

    setAssets,

  ] = useState([]);

  const [

    loading,

    setLoading,

  ] = useState(true);

  const loadAssets = useCallback(async () => {

    try {

      const response =
        await fetch(
          `/api/marketing/assets?organizationId=${encodeURIComponent(organizationId)}`
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

  }, [organizationId]);

  useEffect(() => {
    if (organizationId) loadAssets();
  }, [loadAssets, organizationId]);

  if (loading) {

    return (

      <div className="text-[#5F5A54]">

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
            text-[#191919]
          "
        >

          AI Asset Library

        </h1>

        <div
          className="
            text-[#746E66]
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
              border-black/[0.08]
              rounded-2xl
              overflow-hidden
            "

          >

            <Image

              src={asset.file_url}

              alt="Asset"

              width={1200}
              height={800}
              unoptimized

              className="
                h-56
                w-full
                object-cover
              "

            />

            <div className="p-4">

              <div
                className="
                  text-sm
                  uppercase
                  tracking-[0.15em]
                  text-[#817A72]
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
                  text-[#817A72]
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