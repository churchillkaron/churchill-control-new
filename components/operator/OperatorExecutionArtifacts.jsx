"use client";

import Image from "next/image";
import { ArrowUpRight, Download, FileText, Folder, ImageIcon, Music2, Video } from "lucide-react";

const URL_KEYS = new Set([
  "url", "href", "file_url", "signed_url", "inspection_url", "asset_url",
  "generated_media_url", "output_url", "preview_url", "image_url", "video_url",
  "audio_url", "package_url", "screenshot_url", "thumbnail_url", "document_url",
  "pdf_url", "receipt_url", "download_url", "master_url", "media_url", "storage_reference",
]);

function text(value) {
  return String(value ?? "").trim();
}

function safeArtifactUrl(value, organizationId) {
  const url = text(value);
  if (!url) return null;
  if (url.startsWith("storage://")) {
    const query = new URLSearchParams({
      organizationId: text(organizationId),
      reference: url,
    });
    return `/api/operator/media?${query.toString()}`;
  }
  if (url.startsWith("/")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

function mediaKind(value, mimeType = "", key = "") {
  const mime = text(mimeType).toLowerCase();
  const source = text(value).toLowerCase().split("?")[0];
  const field = text(key).toLowerCase();
  if (mime.startsWith("image/") || /image|screenshot|thumbnail/.test(field) || /\.(png|jpe?g|webp|gif|avif)$/.test(source)) return "image";
  if (mime.startsWith("video/") || /video|master/.test(field) || /\.(mp4|webm|mov|m4v)$/.test(source)) return "video";
  if (mime.startsWith("audio/") || /audio/.test(field) || /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(source)) return "audio";
  if (mime === "application/pdf" || /pdf|receipt|document/.test(field) || /\.pdf$/.test(source)) return "document";
  return "file";
}

function itemLabel(value, parent, kind, index) {
  return text(
    value?.label || value?.title || value?.name || value?.file_name || value?.original_file_name ||
    parent?.label || parent?.title || parent?.name,
  ) || `${kind === "document" ? "Document" : kind === "file" ? "File" : kind[0].toUpperCase() + kind.slice(1)} ${index + 1}`;
}

function folderLabel(value, parent, kind) {
  return text(
    value?.folder || value?.folder_name || value?.filing_folder || value?.group || value?.section ||
    parent?.folder || parent?.folder_name || parent?.filing_folder || parent?.group || parent?.section,
  ) || (kind === "image" ? "Images" : kind === "video" ? "Videos" : kind === "audio" ? "Audio" : kind === "document" ? "Documents" : "Files");
}

export function operatorExecutionArtifacts({ execution = {}, evidence = {}, organizationId = null } = {}) {
  const roots = [execution, execution?.result, evidence];
  const items = [];
  const seen = new Set();

  function add(raw, owner = {}, parent = {}, key = "url") {
    const url = safeArtifactUrl(raw, organizationId);
    if (!url || seen.has(url)) return;
    const mimeType = text(owner?.mime_type || owner?.mimeType || owner?.content_type || owner?.mime);
    const kind = mediaKind(raw, mimeType, key);
    seen.add(url);
    items.push({
      url,
      kind,
      mime_type: mimeType || null,
      label: itemLabel(owner, parent, kind, items.length),
      folder: folderLabel(owner, parent, kind),
    });
  }

  function visit(value, depth = 0, parent = null) {
    if (!value || depth > 8 || items.length >= 48) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, depth + 1, parent));
      return;
    }
    if (typeof value !== "object") return;

    for (const [key, raw] of Object.entries(value)) {
      const normalizedKey = text(key).toLowerCase();
      if (typeof raw === "string" && URL_KEYS.has(normalizedKey)) add(raw, value, parent || {}, normalizedKey);
      if (raw && typeof raw === "object") visit(raw, depth + 1, value);
    }
  }

  roots.forEach((root) => visit(root));
  return items;
}

function KindIcon({ kind }) {
  if (kind === "image") return <ImageIcon size={13} />;
  if (kind === "video") return <Video size={13} />;
  if (kind === "audio") return <Music2 size={13} />;
  return <FileText size={13} />;
}

function ArtifactPreview({ artifact }) {
  if (artifact.kind === "image") {
    return <Image src={artifact.url} alt={artifact.label} width={1400} height={900} unoptimized className="h-auto max-h-[520px] w-full bg-black/20 object-contain" />;
  }
  if (artifact.kind === "video") {
    return <video src={artifact.url} controls preload="metadata" playsInline className="max-h-[560px] w-full bg-black" />;
  }
  if (artifact.kind === "audio") {
    return <audio src={artifact.url} controls preload="metadata" className="w-full" />;
  }
  if (artifact.kind === "document") {
    return <iframe src={artifact.url} title={artifact.label} loading="lazy" className="h-[420px] w-full bg-white" />;
  }
  return null;
}

export default function OperatorExecutionArtifacts({ execution = {}, evidence = {}, organizationId = null }) {
  const artifacts = operatorExecutionArtifacts({ execution, evidence, organizationId });
  if (!artifacts.length) return null;

  const folders = artifacts.reduce((map, artifact) => {
    if (!map.has(artifact.folder)) map.set(artifact.folder, []);
    map.get(artifact.folder).push(artifact);
    return map;
  }, new Map());

  return (
    <div data-avantiqo-execution-artifacts="true" data-avantiqo-universal-preview="true" className="mt-3 space-y-2">
      {[...folders.entries()].map(([folder, folderItems]) => (
        <details key={folder} open className="overflow-hidden rounded-xl border border-[#D6A66A]/20 bg-black/20">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[10px] font-medium text-[#E5C28D]">
            <span className="flex items-center gap-2"><Folder size={13} />{folder}</span>
            <span className="text-[9px] text-white/35">{folderItems.length}</span>
          </summary>
          <div className="space-y-2 border-t border-white/[0.06] p-2">
            {folderItems.map((artifact, index) => (
              <div key={`${artifact.url}-${index}`} className="overflow-hidden rounded-lg border border-white/[0.07] bg-black/25">
                <ArtifactPreview artifact={artifact} />
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-[10px] text-white/65">
                    <KindIcon kind={artifact.kind} />
                    <span className="truncate">{artifact.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <a href={artifact.url} target="_blank" rel="noreferrer noopener" className="rounded-md border border-white/10 p-1.5 text-white/45 hover:text-[#D6A66A]" aria-label={`Open ${artifact.label}`}><ArrowUpRight size={11} /></a>
                    <a href={artifact.url} download className="rounded-md border border-white/10 p-1.5 text-white/45 hover:text-[#D6A66A]" aria-label={`Download ${artifact.label}`}><Download size={11} /></a>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
