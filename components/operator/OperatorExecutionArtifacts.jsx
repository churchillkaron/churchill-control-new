"use client";

import { ArrowUpRight, FileText } from "lucide-react";

function text(value) {
  return String(value ?? "").trim();
}

function safeArtifactUrl(value) {
  const url = text(value);
  if (!url) return null;
  if (url.startsWith("/")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

export function operatorExecutionArtifacts(execution = {}) {
  const result = execution?.result || {};
  const candidates = [
    ...(Array.isArray(execution?.artifacts) ? execution.artifacts : []),
    ...(Array.isArray(result?.artifacts) ? result.artifacts : []),
    ...(Array.isArray(result?.data?.artifacts) ? result.data.artifacts : []),
    ...(Array.isArray(result?.output?.artifacts) ? result.output.artifacts : []),
  ];
  const seen = new Set();
  return candidates.flatMap((artifact) => {
    const url = safeArtifactUrl(artifact?.url || artifact?.href || artifact?.file_url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ ...artifact, url }];
  });
}

export default function OperatorExecutionArtifacts({ execution = {} }) {
  const artifacts = operatorExecutionArtifacts(execution);
  if (!artifacts.length) return null;

  return (
    <div data-avantiqo-execution-artifacts="true" className="mt-3 space-y-2">
      {artifacts.map((artifact, index) => {
        const label = text(artifact?.label || artifact?.name || artifact?.title) || `Generated file ${index + 1}`;
        const mimeType = text(artifact?.mime_type || artifact?.mimeType).toLowerCase();
        const isPdf = mimeType === "application/pdf" || /\.pdf(?:\?|$)/i.test(artifact.url);
        return (
          <a
            key={`${artifact.url}-${index}`}
            href={artifact.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center justify-between gap-3 rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.07] px-3 py-2.5 text-left transition hover:border-[#D6A66A]/45 hover:bg-[#D6A66A]/[0.11]"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <FileText size={14} className="shrink-0 text-[#D6A66A]" />
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-medium text-[#F0D29A]">{label}</span>
                <span className="mt-0.5 block text-[9px] uppercase tracking-[0.12em] text-white/35">
                  {isPdf ? "Open PDF" : "Open file"}
                </span>
              </span>
            </span>
            <ArrowUpRight size={13} className="shrink-0 text-white/35" />
          </a>
        );
      })}
    </div>
  );
}
