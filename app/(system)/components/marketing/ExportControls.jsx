"use client";

import { toPng } from "html-to-image";

export default function ExportControls({
  exportRef,
}) {

  async function exportPoster() {

    try {

      const node =
        exportRef.current;

      if (!node) {

        alert("Poster node missing");

        return;
      }

      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#F7F6F3",
      });

      const link =
        document.createElement("a");

      link.download =
        `poster-${Date.now()}.png`;

      link.href = dataUrl;

      link.click();

    } catch (err) {

      console.error(err);

      alert("Export failed");
    }
  }

  return (

    <button
      onClick={exportPoster}
      className="
        w-full
        bg-[#D6A66A]
        text-[#191919]
        px-8
        py-4
        rounded-xl
        font-bold
      "
    >
      Export Poster
    </button>

  );
}