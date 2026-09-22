const SUPPORTED_SIGNATURES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function text(value, limit = 160) {
  return String(value ?? "").trim().slice(0, limit);
}

function startsWith(buffer, bytes) {
  if (!Buffer.isBuffer(buffer) || buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

function signatureMatches(mimeType, buffer) {
  if (mimeType === "image/jpeg") return startsWith(buffer, [0xff, 0xd8, 0xff]);
  if (mimeType === "image/png") return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === "image/webp") {
    return buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP";
  }
  if (mimeType === "application/pdf") {
    return buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-";
  }
  return false;
}

export async function assertStaffUploadSignature(file, { allowedMimeTypes = null } = {}) {
  if (!file || typeof file.arrayBuffer !== "function") {
    const error = new Error("Upload file required");
    error.status = 400;
    error.code = "STAFF_UPLOAD_FILE_REQUIRED";
    throw error;
  }

  const mimeType = text(file.type).toLowerCase();
  const allowed = allowedMimeTypes instanceof Set ? allowedMimeTypes : SUPPORTED_SIGNATURES;
  if (!allowed.has(mimeType) || !SUPPORTED_SIGNATURES.has(mimeType)) {
    const error = new Error("Unsupported staff upload type");
    error.status = 415;
    error.code = "STAFF_UPLOAD_TYPE_UNSUPPORTED";
    throw error;
  }

  const source = typeof file.slice === "function" ? file.slice(0, 32) : file;
  const header = Buffer.from(await source.arrayBuffer());
  if (!signatureMatches(mimeType, header)) {
    const error = new Error("File contents do not match the declared upload type");
    error.status = 415;
    error.code = "STAFF_UPLOAD_CONTENT_TYPE_MISMATCH";
    throw error;
  }

  return { mimeType };
}

export { SUPPORTED_SIGNATURES };
