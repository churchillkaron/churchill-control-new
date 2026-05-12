"use client";

import { useState }
from "react";

export default function
AssetUploadPanel({

  tenantId,

  pageId,

  refreshAssets,

  metaAccounts = [],

}) {

  const [
    uploading,
    setUploading,
  ] = useState(false);

  const [
    assetType,
    setAssetType,
  ] = useState("staff");

  const [
    selectedBusiness,
    setSelectedBusiness,
  ] = useState(pageId || "");

  const [
    pendingFile,
    setPendingFile,
  ] = useState(null);

  const [
    previewUrl,
    setPreviewUrl,
  ] = useState(null);

  // =====================================
  // LOCAL FILE SELECT
  // =====================================

  function handleFileSelect(
    e
  ) {

    const file =
      e.target.files?.[0];

    if (!file) return;

    setPendingFile(
      file
    );

    const localUrl =
      URL.createObjectURL(
        file
      );

    setPreviewUrl(
      localUrl
    );

  }

  // =====================================
  // CONFIRM UPLOAD
  // =====================================

  async function confirmUpload() {

    try {

      if (!pendingFile) {

        alert(
          "Please choose a file"
        );

        return;

      }

      if (!selectedBusiness) {

        alert(
          "Please choose a business"
        );

        return;

      }

      setUploading(true);

      const formData =
        new FormData();

      formData.append(
        "tenantId",
        tenantId
      );

      formData.append(
        "pageId",
        selectedBusiness
      );

      formData.append(
        "assetType",
        assetType
      );

      formData.append(
        "name",
        pendingFile.name
      );

      formData.append(
        "file",
        pendingFile
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

      if (
        !response.ok ||
        !data.success
      ) {

        throw new Error(

          data.error ||
          "Upload failed"

        );

      }

      alert(
        "Asset uploaded"
      );

      // RESET

      setPendingFile(
        null
      );

      setPreviewUrl(
        null
      );

      // REFRESH

      if (refreshAssets) {

        refreshAssets();

      }

    } catch (err) {

      console.error(
        err
      );

      alert(
        err.message ||
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
        Asset Intake
      </div>

      <div
        className="
          space-y-4
        "
      >

        {/* ========================= */}
        {/* BUSINESS */}
        {/* ========================= */}

        <select
          value={
            selectedBusiness
          }
          onChange={(e) =>

            setSelectedBusiness(
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

          <option value="">
            Select Business
          </option>

          {metaAccounts.map(
            (account) => (

              <option
                key={account.id}
                value={
                  account.page_id
                }
              >

                {account.page_name}

              </option>

            )
          )}

        </select>

        {/* ========================= */}
        {/* ASSET TYPE */}
        {/* ========================= */}

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

          <option value="branding">
            Branding
          </option>

          <option value="event">
            Event
          </option>

        </select>

        {/* ========================= */}
        {/* FILE INPUT */}
        {/* ========================= */}

        <input
          type="file"
          accept="image/*"
          onChange={
            handleFileSelect
          }
          className="
            w-full
            text-sm
          "
        />

        {/* ========================= */}
        {/* PREVIEW */}
        {/* ========================= */}

        {previewUrl && (

          <div
            className="
              rounded-2xl
              overflow-hidden
              border
              border-orange-500/20
            "
          >

            <img
              src={previewUrl}
              alt="Preview"
              className="
                w-full
                h-auto
                object-cover
              "
            />

          </div>

        )}

        {/* ========================= */}
        {/* STATUS */}
        {/* ========================= */}

        <div
          className="
            text-white/50
            text-xs
          "
        >

          {uploading

            ? "Uploading + AI analyzing..."

            : pendingFile

              ? "Review asset settings before upload."

              : "Upload hospitality assets for AI intelligence."

          }

        </div>

        {/* ========================= */}
        {/* ACTIONS */}
        {/* ========================= */}

        <div
          className="
            flex
            gap-3
          "
        >

          <button
            onClick={() => {

              setPendingFile(
                null
              );

              setPreviewUrl(
                null
              );

            }}
            className="
              flex-1
              bg-white/10
              hover:bg-white/20
              transition
              rounded-xl
              py-3
              text-sm
            "
          >
            Cancel
          </button>

          <button
            onClick={
              confirmUpload
            }
            disabled={
              uploading
            }
            className="
              flex-1
              bg-orange-500
              hover:bg-orange-400
              transition
              rounded-xl
              py-3
              text-sm
              font-semibold
              text-black
            "
          >

            {uploading

              ? "Uploading..."

              : "Confirm Upload"

            }

          </button>

        </div>

      </div>

    </div>

  );

}