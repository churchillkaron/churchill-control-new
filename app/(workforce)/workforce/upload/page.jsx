"use client";

import { useState } from "react";

export default function WorkforceUploadPage() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setResult(null);

      const runtimeResponse = await fetch("/api/staff/runtime", {
        cache: "no-store",
      });
      const runtime = await runtimeResponse.json();

      if (!runtimeResponse.ok || !runtime?.success || !runtime?.identity?.organizationId) {
        throw new Error(runtime?.error || "Unable to resolve workforce organization");
      }

      const organizationId = runtime.identity.organizationId;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("organizationId", organizationId);

      const uploadResponse = await fetch("/api/assets/upload-file", {
        method: "POST",
        body: formData,
      });
      const upload = await uploadResponse.json();

      if (!uploadResponse.ok || !upload?.success) {
        throw new Error(upload?.error || "Unable to upload file");
      }

      const classifyResponse = await fetch("/api/intake/classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: upload.url,
          organizationId: upload.organizationId || organizationId,
          documentId: upload.documentId,
        }),
      });
      const classification = await classifyResponse.json();

      if (!classifyResponse.ok || !classification?.success) {
        throw new Error(classification?.error || "Unable to classify document");
      }

      setResult(classification);
    } catch (error) {
      console.error(error);
      setResult({
        success: false,
        error: error?.message || "Upload failed",
      });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Upload Anything</h1>
        <p className="mt-2 text-white/60">
          Take a photo and let Churchill AI route it to the correct business workflow.
        </p>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-[32px] border border-white/10 bg-white/[0.04] p-10">
        <div className="text-7xl">📸</div>
        <div className="mt-4 text-xl font-semibold">
          {uploading ? "Analyzing..." : "Open Camera"}
        </div>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={uploading}
          onChange={handleUpload}
        />
      </label>

      {result?.success ? (
        <div className="rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 p-5">
          <div className="font-semibold">{result.classification?.type || "CLASSIFIED"}</div>
          <div className="text-sm text-white/60">
            Confidence: {result.classification?.confidence ?? "--"}
          </div>
          <div className="mt-2 text-sm">{result.classification?.reason || "Document classified."}</div>
        </div>
      ) : null}

      {result && !result.success ? (
        <div className="rounded-[24px] border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-200">
          {result.error || "Upload failed"}
        </div>
      ) : null}
    </div>
  );
}
