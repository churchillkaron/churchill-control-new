"use client";

import { useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";
import { useActiveOrganization } from "@/lib/hooks/useActiveOrganization";

export default function WorkforceUploadPage() {

  const {
    tenantId,
    organizationId,
  } = useActiveOrganization();

  const [uploading, setUploading] =
    useState(false);

  const [result, setResult] =
    useState(null);

  async function handleUpload(event) {

    const file =
      event.target.files?.[0];

    if (!file) return;

    try {

      setUploading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      formData.append(
        "organizationId",
        organizationId
      );

      formData.append(
        "tenantId",
        tenantId
      );

      const uploadResponse =
        await fetch(
          "/api/assets/upload-file",
          {
            method: "POST",
            body: formData,
          }
        );

      const upload =
        await uploadResponse.json();

      if (!upload.success) {

        throw new Error(
          upload.error
        );

      }

      const classifyResponse =
        await fetch(
          "/api/intake/classify",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              image:
                upload.url,

              tenantId:
                tenantId,

              organizationId:
                organizationId,

              documentId:
                upload.documentId,

              uploadedBy:
                user?.id,

            }),

          }
        );

      const classification =
        await classifyResponse.json();

      setResult(
        classification
      );

    } catch (error) {

      console.error(error);

      alert(
        error.message
      );

    } finally {

      setUploading(false);

    }

  }

  return (

    <div className="space-y-6">

      <div>

        <h1 className="text-3xl font-bold text-white">
          Upload Anything
        </h1>

        <p className="mt-2 text-white/60">
          Take a photo and let Churchill AI decide.
        </p>

      </div>

      <label
        className="flex cursor-pointer flex-col items-center justify-center rounded-[32px] border border-white/10 bg-white/[0.04] p-10"
      >

        <div className="text-7xl">
          📸
        </div>

        <div className="mt-4 text-xl font-semibold">
          {uploading
            ? "Analyzing..."
            : "Open Camera"}
        </div>

        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleUpload}
        />

      </label>

      {result?.success && (

        <div className="rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 p-5">

          <div className="font-semibold">
            {result.classification.type}
          </div>

          <div className="text-sm text-white/60">
            Confidence:
            {" "}
            {result.classification.confidence}
          </div>

          <div className="mt-2 text-sm">
            {result.classification.reason}
          </div>

        </div>

      )}

    </div>

  );

}
