import { PDFDocument } from "pdf-lib";

function text(value, maximum = 240) { return String(value ?? "").trim().slice(0, maximum); }
function cleanPages(value) {
  const pages = Array.isArray(value) ? value : [];
  const normalized = [...new Set(pages.map(Number).filter((page) => Number.isInteger(page) && page > 0))];
  return normalized.sort((a, b) => a - b);
}

export async function splitPdfPages({ bytes, pageNumbers, filename = "document.pdf" } = {}) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!buffer.length) throw new Error("PDF_SPLIT_SOURCE_REQUIRED");
  const pages = cleanPages(pageNumbers);
  if (!pages.length) throw new Error("PDF_SPLIT_PAGES_REQUIRED");

  const source = await PDFDocument.load(buffer);
  const pageCount = source.getPageCount();
  if (pages.some((page) => page > pageCount)) throw new Error(`PDF_SPLIT_PAGE_OUT_OF_RANGE:${pageCount}`);

  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, pages.map((page) => page - 1));
  for (const page of copied) output.addPage(page);
  const saved = Buffer.from(await output.save());
  const base = text(filename).replace(/\.pdf$/i, "") || "document";
  return { bytes: saved, page_numbers: pages, source_page_count: pageCount, filename: `${base}-pages-${pages.join("-")}.pdf` };
}

export function validateDistinctPdfObjectSpans(objects = []) {
  if (!Array.isArray(objects) || objects.length < 2 || objects.length > 20) throw new Error("PDF_SPLIT_OBJECT_COUNT_INVALID");
  const used = new Set();
  return objects.map((object, index) => {
    const pages = cleanPages(object?.page_numbers || object?.pages);
    if (!pages.length) throw new Error(`PDF_SPLIT_OBJECT_PAGES_REQUIRED:${index + 1}`);
    for (const page of pages) {
      if (used.has(page)) throw new Error(`PDF_SPLIT_OVERLAPPING_PAGE:${page}`);
      used.add(page);
    }
    return { ...object, page_numbers: pages };
  });
}

export default splitPdfPages;
