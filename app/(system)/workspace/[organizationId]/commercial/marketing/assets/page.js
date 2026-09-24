"use client";

export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageIcon, RefreshCw, Sparkles } from "lucide-react";

function previewUrl(asset = {}) {
  return asset.file_url || asset.image_url || asset.thumbnail_url || null;
}

function assetLabel(asset = {}) {
  return String(asset.asset_type || asset.metadata?.media_kind || "Asset").replaceAll("_", " ");
}

export default function MarketingAssetsPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [state, setState] = useState({ loading: true, error: "", assets: [] });

  const loadAssets = useCallback(async () => {
    if (!organizationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/marketing/assets?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) throw new Error(data?.error || "Unable to load creative assets");
      setState({ loading: false, error: "", assets: data.assets || [] });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to load creative assets", assets: [] });
    }
  }, [organizationId]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const assets = state.assets;
  const generatedCount = useMemo(() => assets.filter((asset) => asset.ai_generated === true || asset.metadata?.ai_generated === true).length, [assets]);

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-5 text-[#191919] md:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A37849]">Marketing · Creative</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Creative Asset Library</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#746E66]">Organization-owned uploaded and generated media available for governed campaign planning and Creative Studio workflows.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={loadAssets} disabled={state.loading} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm text-[#625B53] disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${state.loading ? "animate-spin" : ""}`} />Refresh</button>
            <Link href={`/workspace/${organizationId}/commercial/design`} className="inline-flex items-center gap-2 rounded-xl bg-[#D6A66A] px-4 py-2.5 text-sm font-semibold text-[#2B2118]"><Sparkles className="h-4 w-4" />Creative Studio</Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[10px] uppercase tracking-[0.12em] text-[#918B83]">Available assets</div><div className="mt-2 text-2xl font-semibold">{assets.length}</div></div>
          <div className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[10px] uppercase tracking-[0.12em] text-[#918B83]">AI-generated</div><div className="mt-2 text-2xl font-semibold">{generatedCount}</div></div>
        </section>

        {state.error ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-700/15 bg-red-50 px-4 py-3 text-sm text-red-800"><span>{state.error}</span><button type="button" onClick={loadAssets} className="rounded-lg border border-red-700/15 bg-white px-3 py-1.5 text-xs font-semibold">Retry</button></div> : null}

        {state.loading ? (
          <div className="rounded-[28px] border border-black/[0.07] bg-white px-6 py-16 text-center text-sm text-[#817B73]">Loading organization assets…</div>
        ) : assets.length ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {assets.map((asset) => {
              const preview = previewUrl(asset);
              return (
                <article key={asset.id} className="overflow-hidden rounded-[22px] border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                  <div className="relative flex h-52 items-center justify-center overflow-hidden bg-[#F3EFE9]">
                    {preview ? <Image src={preview} alt={asset.name || "Creative asset"} fill sizes="(min-width:1280px) 25vw, (min-width:640px) 50vw, 100vw" unoptimized className="object-cover" /> : <div className="text-center text-[#9B9289]"><ImageIcon className="mx-auto h-6 w-6" /><div className="mt-2 text-xs">Preview unavailable</div></div>}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold text-[#3E3730]">{asset.name || asset.file_name || "Creative asset"}</div><div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#A37849]">{assetLabel(asset)}</div></div>{asset.approval_state ? <span className="shrink-0 rounded-full border border-black/[0.06] bg-[#FAF8F5] px-2 py-1 text-[8px] uppercase text-[#817B73]">{String(asset.approval_state).replaceAll("_", " ")}</span> : null}</div>
                    {Array.isArray(asset.tags) && asset.tags.length ? <div className="mt-3 flex flex-wrap gap-1.5">{asset.tags.slice(0, 5).map((tag) => <span key={tag} className="rounded-full border border-[#D8C2A8] bg-[#FBF4EA] px-2 py-1 text-[9px] text-[#7A5735]">{tag}</span>)}</div> : null}
                    <div className="mt-4 text-[9px] text-[#918B83]">{asset.provider ? `Provider · ${asset.provider}` : asset.source_type ? `Source · ${String(asset.source_type).replaceAll("_", " ")}` : "Organization asset"}</div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : !state.error ? (
          <section className="rounded-[28px] border border-black/[0.07] bg-white px-6 py-16 text-center"><ImageIcon className="mx-auto h-7 w-7 text-[#A37849]" /><div className="mt-3 text-sm font-semibold text-[#514A43]">No creative assets yet</div><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[#918B83]">Upload approved media from Campaigns or create organization-owned work in Creative Studio. Assets remain scoped to this organization.</p><Link href={`/workspace/${organizationId}/commercial/design`} className="mt-5 inline-flex rounded-xl bg-[#D6A66A] px-4 py-2.5 text-xs font-semibold text-[#2B2118]">Open Creative Studio</Link></section>
        ) : null}
      </div>
    </main>
  );
}
