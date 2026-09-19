"use client";

import { Fragment } from "react";

function text(value) {
  return String(value ?? "").trim();
}

function inlineParts(value) {
  const source = String(value ?? "");
  const parts = source.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-medium text-white/90">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function blockLines(block, blockIndex) {
  const lines = block.split("\n").map((line) => line.trimEnd());
  const bullets = lines.every((line) => /^[-*]\s+/.test(line.trim()));
  if (bullets) {
    return (
      <ul key={blockIndex} className="space-y-1.5 pl-5 text-inherit">
        {lines.map((line, lineIndex) => (
          <li key={lineIndex} className="list-disc pl-1 marker:text-white/30">
            {inlineParts(line.trim().replace(/^[-*]\s+/, ""))}
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
          {inlineParts(line)}
        </Fragment>
      ))}
    </p>
  );
}

export default function OperatorConversationText({ content, compact = false }) {
  const source = text(content);
  if (!source) return null;
  const blocks = source.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <div
      data-avantiqo-conversation-text="true"
      className={
        compact
          ? "space-y-2 text-[13px] font-light leading-6 text-white/85"
          : "space-y-3 text-sm font-light leading-6 text-white/80"
      }
    >
      {blocks.map(blockLines)}
    </div>
  );
}
