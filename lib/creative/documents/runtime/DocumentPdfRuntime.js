import jsPDF from "jspdf";

export function renderDocumentPdf(document = {}) {
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 54;
  const contentWidth = width - margin * 2;
  let y = margin;

  function ensure(space) {
    if (y + space <= height - margin) return;
    pdf.addPage();
    y = margin;
  }

  function lines(value, size, bold = false, indent = 0) {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    for (const line of pdf.splitTextToSize(String(value || ""), contentWidth - indent)) {
      ensure(size + 7);
      pdf.text(line, margin + indent, y);
      y += size + 4;
    }
  }

  lines(document.title, 24, true);
  if (document.subtitle) {
    y += 5;
    lines(document.subtitle, 12);
  }
  y += 18;

  for (const section of document.sections || []) {
    lines(section.heading, 16, true);
    y += 4;
    for (const paragraph of section.paragraphs || []) {
      lines(paragraph, 11);
      y += 7;
    }
    for (const bullet of section.bullets || []) {
      lines(`• ${bullet}`, 11, false, 12);
      y += 3;
    }
    y += 12;
  }

  return Buffer.from(pdf.output("arraybuffer"));
}
