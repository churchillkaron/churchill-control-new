export const IMPORT_EXPORT_FORMATS = {
  csv: {
    label: "CSV",
    extension: ".csv",
    mime: "text/csv",
    group: "Spreadsheet",
  },
  xlsx: {
    label: "Excel XLSX",
    extension: ".xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    group: "Spreadsheet",
  },
  xls: {
    label: "Excel XLS",
    extension: ".xls",
    mime: "application/vnd.ms-excel",
    group: "Spreadsheet",
  },
  ods: {
    label: "OpenDocument Spreadsheet",
    extension: ".ods",
    mime: "application/vnd.oasis.opendocument.spreadsheet",
    group: "Spreadsheet",
  },
  json: {
    label: "JSON",
    extension: ".json",
    mime: "application/json",
    group: "Data",
  },
  xml: {
    label: "XML",
    extension: ".xml",
    mime: "application/xml",
    group: "Data",
  },
  zip: {
    label: "ZIP Package",
    extension: ".zip",
    mime: "application/zip",
    group: "Package",
  },

  sie: {
    label: "SIE",
    extension: ".sie",
    mime: "text/plain",
    group: "Accounting",
  },
  saft: {
    label: "SAF-T XML",
    extension: ".xml",
    mime: "application/xml",
    group: "Accounting",
  },
  ubl: {
    label: "UBL XML",
    extension: ".xml",
    mime: "application/xml",
    group: "Accounting",
  },
  peppol: {
    label: "Peppol BIS",
    extension: ".xml",
    mime: "application/xml",
    group: "Accounting",
  },
  camt: {
    label: "ISO20022 CAMT",
    extension: ".xml",
    mime: "application/xml",
    group: "Banking",
  },
  pain: {
    label: "ISO20022 PAIN",
    extension: ".xml",
    mime: "application/xml",
    group: "Banking",
  },
  mt940: {
    label: "MT940",
    extension: ".sta",
    mime: "text/plain",
    group: "Banking",
  },
  ofx: {
    label: "OFX",
    extension: ".ofx",
    mime: "application/x-ofx",
    group: "Banking",
  },
  qif: {
    label: "QIF",
    extension: ".qif",
    mime: "application/qif",
    group: "Banking",
  },
  iif: {
    label: "QuickBooks IIF",
    extension: ".iif",
    mime: "text/plain",
    group: "Accounting",
  },
  xbrl: {
    label: "XBRL GL",
    extension: ".xbrl",
    mime: "application/xml",
    group: "Accounting",
  },

  pdf: {
    label: "PDF",
    extension: ".pdf",
    mime: "application/pdf",
    group: "Document",
  },
  docx: {
    label: "Word DOCX",
    extension: ".docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    group: "Document",
  },
  txt: {
    label: "Text",
    extension: ".txt",
    mime: "text/plain",
    group: "Document",
  },
  eml: {
    label: "Email EML",
    extension: ".eml",
    mime: "message/rfc822",
    group: "Document",
  },
  jpg: {
    label: "JPEG Image",
    extension: ".jpg",
    mime: "image/jpeg",
    group: "Image",
  },
  png: {
    label: "PNG Image",
    extension: ".png",
    mime: "image/png",
    group: "Image",
  },
  heic: {
    label: "HEIC Image",
    extension: ".heic",
    mime: "image/heic",
    group: "Image",
  },
  webp: {
    label: "WebP Image",
    extension: ".webp",
    mime: "image/webp",
    group: "Image",
  },

  html: {
    label: "HTML",
    extension: ".html",
    mime: "text/html",
    group: "Report",
  },
  md: {
    label: "Markdown",
    extension: ".md",
    mime: "text/markdown",
    group: "Report",
  },
  pptx: {
    label: "PowerPoint",
    extension: ".pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    group: "Report",
  },

  avx: {
    label: "Avantiqo Package",
    extension: ".avx",
    mime: "application/octet-stream",
    group: "Avantiqo",
  },
  workspace: {
    label: "Workspace Backup",
    extension: ".zip",
    mime: "application/zip",
    group: "Avantiqo",
  },
  module: {
    label: "Module Package",
    extension: ".zip",
    mime: "application/zip",
    group: "Avantiqo",
  },
  audit: {
    label: "Audit Package",
    extension: ".zip",
    mime: "application/zip",
    group: "Compliance",
  },
  compliance: {
    label: "Compliance Package",
    extension: ".zip",
    mime: "application/zip",
    group: "Compliance",
  },
};

export const DEFAULT_IMPORT_FORMATS = [
  "csv",
  "xlsx",
  "xls",
  "ods",
  "json",
  "xml",
  "zip",
  "sie",
  "saft",
  "ubl",
  "peppol",
  "camt",
  "pain",
  "mt940",
  "ofx",
  "qif",
  "iif",
  "xbrl",
  "pdf",
  "docx",
  "txt",
  "eml",
  "jpg",
  "png",
  "heic",
  "webp",
  "avx",
  "workspace",
  "module",
];

export const DEFAULT_EXPORT_FORMATS = [
  "xlsx",
  "csv",
  "json",
  "xml",
  "pdf",
  "docx",
  "html",
  "md",
  "zip",
  "sie",
  "saft",
  "ubl",
  "peppol",
  "camt",
  "pain",
  "mt940",
  "ofx",
  "qif",
  "iif",
  "xbrl",
  "pptx",
  "avx",
  "workspace",
  "module",
  "audit",
  "compliance",
];

export function getAcceptValue(formatKeys = DEFAULT_IMPORT_FORMATS) {
  return formatKeys
    .map(key => IMPORT_EXPORT_FORMATS[key]?.extension)
    .filter(Boolean)
    .join(",");
}

export function getFormatOptions(formatKeys = DEFAULT_EXPORT_FORMATS) {
  return formatKeys
    .map(key => ({
      key,
      ...(IMPORT_EXPORT_FORMATS[key] || {
        label: key.toUpperCase(),
        extension: `.${key}`,
        mime: "application/octet-stream",
        group: "Other",
      }),
    }));
}

export function getFileExtension(format) {
  return IMPORT_EXPORT_FORMATS[format]?.extension || `.${format || "dat"}`;
}
