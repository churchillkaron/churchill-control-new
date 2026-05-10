"use client";

import { useState }
from "react";


export default function
AssetUploadPanel({

  tenantId,

  pageId,

  refreshAssets,

}){

  const [
    uploading,
    setUploading,
  ] = useState(false);

  const [
    assetType,
    setAssetType,
  ] = useState("staff");

  async function uploadAsset(
    e
  ) {

    try {

      const file =
        e.target.files?.[0];

      if (!file) return;

      setUploading(true);

      const formData =
  new FormData();

formData.append(
  "tenantId",
  tenantId
);

formData.append(
  "pageId",
  pageId || ""
);

formData.append(
  "assetType",
  assetType
);

formData.append(
  "name",
  file.name
);

formData.append(
  "file",
  file
);

const response =
  await fetch(
    "/api/marketing/upload-asset",
    {
      method:
        "POST",

      body:
        formData,
    }
  );

const data =
  await response.json();

if (!response.ok || !data.success) {

  throw new Error(
    data.error ||
    "Upload failed"
  );

}
    

      alert(
        "Asset uploaded"
      );

      if (refreshAssets) {

  refreshAssets();

}

    } catch (err) {

      console.error(
        err
      );

      alert(
        "Upload failed"
      );

    } finally {

      setUploading(false);

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

      <div
        className="
          text-orange-500
          uppercase
          tracking-[0.2em]
          text-xs
          mb-5
        "
      >
        Upload Assets
      </div>

      <div className="space-y-4">

        <select
          value={assetType}
          onChange={(e) =>
            setAssetType(
              e.target.value
            )
          }
          className="
            w-full
            bg-black/40
            border
            border-white/10
            rounded-xl
            p-3
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

        </select>

        <input
          type="file"
          accept="image/*"
          onChange={uploadAsset}
          className="
            w-full
            text-sm
          "
        />

        <div
          className="
            text-white/50
            text-xs
          "
        >

          {uploading
            ? "Uploading + AI analyzing..."
            : "Upload hospitality assets for AI intelligence."}

        </div>

      </div>

    </div>

  );

}