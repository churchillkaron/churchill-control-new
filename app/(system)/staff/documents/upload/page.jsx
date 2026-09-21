"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, FileUp, RefreshCw, ShieldCheck } from "lucide-react";

export default function StaffUploadPage() {
  const inputRef = useRef(null);
  const [state, setState] = useState({ uploading: false, result: null, error: "" });

  async function handleUpload(file) {
    if (!file) return;
    setState({ uploading: true, result: null, error: "" });
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/staff/quick-upload", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to upload file");
      setState({ uploading: false, result: payload, error: "" });
    } catch (error) {
      setState({ uploading: false, result: null, error: error?.message || "Upload failed" });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <main className="min-h-[70vh] bg-[#F7F6F3] px-4 py-5 text-[#1B1A18] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <section className="rounded-[28px] border border-black/[0.07] bg-white p-5 shadow-[0_12px_34px_rgba(55,47,38,0.05)] sm:p-7">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-[#D6A66A]"><ShieldCheck className="h-4 w-4" /> Private staff capture</div>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.03em]">Take a photo or upload a document</h1>
          <p className="mt-2 text-sm leading-6 text-[#817B73]">Your upload is stored privately as a controlled staff document. Avantiqo-owned document vision is local-first and paid fallback is not used for this quick capture flow.</p>
        </section>

        <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" disabled={state.uploading} onChange={(event) => handleUpload(event.target.files?.[0])} />
        <button onClick={() => inputRef.current?.click()} disabled={state.uploading} className="flex min-h-52 w-full flex-col items-center justify-center rounded-[32px] border border-[#D6A66A]/25 bg-white p-8 text-center shadow-[0_16px_45px_rgba(55,47,38,0.06)] disabled:opacity-50">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-[#D6A66A] text-[#171614] shadow-[0_14px_34px_rgba(120,86,44,0.24)]">{state.uploading ? <RefreshCw className="h-8 w-8 animate-spin" /> : <Camera className="h-8 w-8" />}</span>
          <span className="mt-4 text-lg font-black">{state.uploading ? "Saving privately..." : "Open camera"}</span>
          <span className="mt-1 text-xs text-[#948E86]">Camera, photo library, or PDF</span>
        </button>

        {state.result ? (
          <section className="rounded-[24px] border border-emerald-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-black text-[#5E6D58]"><CheckCircle2 className="h-5 w-5" /> Upload saved privately</div>
            <div className="mt-3 grid gap-2 text-xs text-[#817B73] sm:grid-cols-2">
              <div className="rounded-xl bg-[#FCFBF9] p-3"><span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[#AAA49C]">Document</span><span className="mt-1 block font-semibold">{state.result.documentId}</span></div>
              <div className="rounded-xl bg-[#FCFBF9] p-3"><span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[#AAA49C]">Classification</span><span className="mt-1 block font-semibold">{state.result.classificationStatus || "Saved"}</span></div>
            </div>
            {state.result.classification?.document_type ? <div className="mt-3 flex items-center gap-2 text-xs text-[#5E5952]"><FileUp className="h-4 w-4" /> Detected: {state.result.classification.document_type}</div> : null}
          </section>
        ) : null}

        {state.error ? <div className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-[#984C43]">{state.error}</div> : null}
      </div>
    </main>
  );
}
