"use client";

import { Fragment } from "react";

function text(value) {
  return String(value ?? "").trim();
}


function formattedJson(value) {
  const source = text(value);
  if (!source || (!source.startsWith("{") && !source.startsWith("["))) return null;
  try {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== "object") return null;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

function inlineParts(value, tone = "dark") {
  const source = String(value ?? "");
  const parts = source.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className={tone === "light" ? "font-medium text-[#2F2C28]" : "font-medium text-white/90"}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function blockLines(block, blockIndex, tone = "dark") {
  const lines = block.split("\n").map((line) => line.trimEnd());
  const bullets = lines.every((line) => /^[-*]\s+/.test(line.trim()));
  if (bullets) {
    return (
      <ul key={blockIndex} className="space-y-1.5 pl-5 text-inherit">
        {lines.map((line, lineIndex) => (
          <li key={lineIndex} className={tone === "light" ? "list-disc pl-1 marker:text-[#B3ADA5]" : "list-disc pl-1 marker:text-white/30"}>
            {inlineParts(line.trim().replace(/^[-*]\s+/, ""), tone)}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p key={blockIndex} className="whitespace-pre-wrap">
      {lines.map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex ? <br /> : null}
          {inlineParts(line, tone)}
        </Fragment>
      ))}
    </p>
  );
}

export default function OperatorConversationText({ content, compact = false, tone = "dark" }) {
  const source = text(content);
  if (!source) return null;
  const json = formattedJson(source);
  if (json) {
    return (
      <pre
        data-avantiqo-conversation-text="true"
        data-avantiqo-conversation-json="true"
        className={
          compact
            ? tone === "light"
              ? "max-w-full whitespace-pre-wrap break-all rounded-xl bg-black/[0.035] px-3 py-2 font-mono text-[12px] leading-5 text-[#3F3B36]"
              : "max-w-full whitespace-pre-wrap break-all rounded-xl bg-white/[0.05] px-3 py-2 font-mono text-[12px] leading-5 text-white/85"
            : tone === "light"
              ? "max-w-full whitespace-pre-wrap break-all rounded-xl bg-black/[0.035] px-3 py-3 font-mono text-[13px] leading-5 text-[#3F3B36]"
              : "max-w-full whitespace-pre-wrap break-all rounded-xl bg-white/[0.05] px-3 py-3 font-mono text-[13px] leading-5 text-white/85"
        }
      >
        {json}
      </pre>
    );
  }
  const blocks = source.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <div
      data-avantiqo-conversation-text="true"
      className={
        compact
          ? tone === "light"
            ? "space-y-2 text-[13px] leading-6 text-[#4E4A44]"
            : "space-y-2 text-[13px] font-light leading-6 text-white/85"
          : tone === "light"
            ? "space-y-3 text-sm leading-6 text-[#3F3B36]"
            : "space-y-3 text-sm font-light leading-6 text-white/80"
      }
    >
      {blocks.map((block, index) => blockLines(block, index, tone))}
    </div>
  );
}
