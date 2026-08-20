import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabase = getServiceSupabase();

const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ROOT = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/ui`;
const MANIFEST_PATH = `${ROOT}/manifest-v1.json`;
const MAX_SOURCE_BYTES = 18 * 1024 * 1024;
const NORMALIZED_WIDTH = 1920;
const NORMALIZED_HEIGHT = 1080;

const SLOT_DEFINITIONS = Object.freeze({
  organization_intelligence: Object.freeze({
    label: "Organization Intelligence",
    role: "SHARED_OPERATING_CONTEXT",
    required: true,
  }),
  operations_command_center: Object.freeze({
    label: "Operations Command Center",
    role: "OPERATIONS_EXECUTION",
    required: true,
  }),
  supply_chain: Object.freeze({
    label: "Supply Chain",
    role: "SUPPLY_CHAIN_AND_INVENTORY",
    required: true,
  }),
  finance: Object.freeze({
    label: "Finance",
    role: "FINANCE_CONTROL",
    required: true,
  }),
  general_ledger: Object.freeze({
    label: "General Ledger",
    role: "FINANCIAL_RECORD",
    required: true,
  }),
  finance_governance_accounting_settings: Object.freeze({
    label: "Accounting Settings",
    role: "FINANCE_GOVERNANCE",
    required: true,
  }),
  autonomous_marketing: Object.freeze({
    label: "Autonomous Marketing",
    role: "MARKETING_EXECUTION",
    required: true,
  }),
  customer_communications: Object.freeze({
    label: "Customer Communications",
    role: "CUSTOMER_INTERACTION",
    required: true,
  }),
  payroll_control_center: Object.freeze({
    label: "Payroll Control Center",
    role: "PEOPLE_AND_PAYROLL",
    required: true,
  }),
  employee_directory: Object.freeze({
    label: "Employee Directory",
    role: "PEOPLE_CONTEXT",
    required: true,
  }),
  integrations_connected_services: Object.freeze({
    label: "Integrations / Connected Services",
    role: "CHANNELS_AND_INTEGRATIONS",
    required: true,
  }),
  restaurant_operations: Object.freeze({
    label: "Venue Operations",
    role: "RESTAURANT_VERTICAL",
    required: true,
  }),
  pest_control_operations: Object.freeze({
    label: "Field Service Operations",
    role: "FIELD_SERVICE_VERTICAL",
    required: true,
  }),
  healthcare_operations: Object.freeze({
    label: "Healthcare Operations",
    role: "HEALTHCARE_VERTICAL",
    required: true,
  }),
  hotel_operations: Object.freeze({
    label: "Property Operations",
    role: "HOTEL_VERTICAL",
    required: false,
  }),
  approval_control: Object.freeze({
    label: "Approval / Control",
    role: "APPROVAL_AND_ACCOUNTABILITY",
    required: false,
  }),
});

const ALLOWED_MIME_TYPES = Object.freeze(new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]));

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampInteger(value, min, max) {
  const parsed = Math.round(number(value) ?? min);
  return Math.min(max, Math.max(min, parsed));
}

function slotDefinition(slot) {
  const key = text(slot);
  const definition = SLOT_DEFINITIONS[key];
  if (!definition) throw new Error("INVESTOR_UI_SLOT_NOT_ALLOWED");
  return { key, definition };
}

async function fileBytes(file) {
  if (!file) throw new Error("INVESTOR_UI_FILE_REQUIRED");
  if (Buffer.isBuffer(file)) return file;
  if (file instanceof Uint8Array) return Buffer.from(file);
  if (typeof file.arrayBuffer === "function") {
    return Buffer.from(await file.arrayBuffer());
  }
  if (file.buffer) return Buffer.from(file.buffer);
  throw new Error("INVESTOR_UI_FILE_PAYLOAD_UNSUPPORTED");
}

function mimeType(file) {
  return text(file?.type || file?.mime_type || file?.mimeType).toLowerCase();
}

function originalName(file, slot) {
  const candidate = text(file?.name || file?.fileName || file?.filename);
  return candidate || `${slot}-source`;
}

function sanitizeName(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 120) || "source";
}

function cropFromInput(input, width, height) {
  const source = input && typeof input === "object" ? input : {};
  const left = clampInteger(source.left, 0, Math.max(0, width - 1));
  const top = clampInteger(source.top, 0, Math.max(0, height - 1));
  const maxWidth = Math.max(1, width - left);
  const maxHeight = Math.max(1, height - top);
  const cropWidth = clampInteger(source.width ?? maxWidth, 1, maxWidth);
  const cropHeight = clampInteger(source.height ?? maxHeight, 1, maxHeight);
  return { left, top, width: cropWidth, height: cropHeight };
}

async function objectExists(storagePath) {
  const directory = path.posix.dirname(storagePath);
  const filename = path.posix.basename(storagePath);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(directory, { search: filename, limit: 10 });
  if (error) return false;
  return (data || []).some((row) => row.name === filename);
}

async function readManifest() {
  if (!(await objectExists(MANIFEST_PATH))) {
    return {
      contract: "AVANTIQO_INVESTOR_AUTHENTIC_UI_MANIFEST_V1",
      organization_id: ORGANIZATION_ID,
      source_policy: "USER_SUPPLIED_AUTHENTIC_AVANTIQO_UI_ONLY",
      synthetic_ui_allowed: false,
      browser_chrome_policy: "CROP_ONLY_DO_NOT_RECREATE_UI",
      updated_at: null,
      slots: {},
    };
  }

  const { data, error } = await supabase.storage.from(BUCKET).download(MANIFEST_PATH);
  if (error) throw error;
  if (!data) throw new Error("INVESTOR_UI_MANIFEST_EMPTY");
  const parsed = JSON.parse(Buffer.from(await data.arrayBuffer()).toString("utf8"));
  return parsed && typeof parsed === "object" ? parsed : { slots: {} };
}

async function writeManifest(manifest) {
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  const { error } = await supabase.storage.from(BUCKET).upload(MANIFEST_PATH, bytes, {
    contentType: "application/json",
    cacheControl: "60",
    upsert: true,
    metadata: {
      organization_id: ORGANIZATION_ID,
      source_policy: "USER_SUPPLIED_AUTHENTIC_AVANTIQO_UI_ONLY",
    },
  });
  if (error) throw error;
  return MANIFEST_PATH;
}

async function uploadBytes(storagePath, bytes, contentType, metadata = {}) {
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType,
    cacheControl: "3600",
    upsert: true,
    metadata: {
      organization_id: ORGANIZATION_ID,
      investor_film: "20260820",
      authentic_ui: "true",
      ...metadata,
    },
  });
  if (error) throw error;
}

async function signedUrl(storagePath, seconds = 900) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

export function getAvantiqoInvestorUiSlots() {
  return Object.entries(SLOT_DEFINITIONS).map(([key, definition]) => ({
    key,
    ...definition,
    normalized_path: `${ROOT}/${key}.png`,
  }));
}

export async function getAvantiqoInvestorUiIngestionStatus() {
  const manifest = await readManifest();
  const slots = await Promise.all(
    getAvantiqoInvestorUiSlots().map(async (slot) => {
      const ready = await objectExists(slot.normalized_path);
      return {
        ...slot,
        ready,
        manifest: manifest?.slots?.[slot.key] || null,
      };
    }),
  );

  const required = slots.filter((slot) => slot.required);
  return {
    success: true,
    contract: "AVANTIQO_INVESTOR_AUTHENTIC_UI_INGESTION_V1",
    source_policy: "USER_SUPPLIED_AUTHENTIC_AVANTIQO_UI_ONLY",
    synthetic_ui_allowed: false,
    manifest_path: MANIFEST_PATH,
    required_ready: required.every((slot) => slot.ready),
    required_ready_count: required.filter((slot) => slot.ready).length,
    required_total: required.length,
    slots,
  };
}

export async function ingestAvantiqoInvestorUiFrame({
  slot,
  file,
  crop = null,
  approvedBy = "user",
} = {}) {
  const { key, definition } = slotDefinition(slot);
  const bytes = await fileBytes(file);
  if (!bytes.length) throw new Error("INVESTOR_UI_FILE_EMPTY");
  if (bytes.length > MAX_SOURCE_BYTES) throw new Error("INVESTOR_UI_FILE_TOO_LARGE");

  const mime = mimeType(file);
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    throw new Error("INVESTOR_UI_FILE_TYPE_NOT_ALLOWED");
  }

  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const image = sharp(bytes, { failOn: "error" }).rotate();
  const metadata = await image.metadata();
  const sourceWidth = Number(metadata.width || 0);
  const sourceHeight = Number(metadata.height || 0);
  if (!sourceWidth || !sourceHeight) throw new Error("INVESTOR_UI_IMAGE_DIMENSIONS_REQUIRED");
  if (sourceWidth < 900 || sourceHeight < 500) {
    throw new Error("INVESTOR_UI_IMAGE_RESOLUTION_TOO_LOW");
  }

  const cropRect = cropFromInput(crop, sourceWidth, sourceHeight);
  const normalized = await image
    .extract(cropRect)
    .resize(NORMALIZED_WIDTH, NORMALIZED_HEIGHT, {
      fit: "contain",
      background: { r: 3, g: 5, b: 9, alpha: 1 },
      withoutEnlargement: false,
    })
    .png({ compressionLevel: 8, adaptiveFiltering: true })
    .toBuffer();

  const normalizedChecksum = crypto.createHash("sha256").update(normalized).digest("hex");
  const safeOriginal = sanitizeName(originalName(file, key));
  const originalExtension = mime === "image/jpeg" ? ".jpg" : mime === "image/webp" ? ".webp" : ".png";
  const sourcePath = `${ROOT}/source/${key}/${checksum.slice(0, 16)}-${safeOriginal.replace(/\.[^.]+$/, "")}${originalExtension}`;
  const normalizedPath = `${ROOT}/${key}.png`;

  await uploadBytes(sourcePath, bytes, mime, {
    ui_slot: key,
    ui_role: definition.role,
    source_checksum_sha256: checksum,
    approved_by: text(approvedBy) || "user",
    derivative: "false",
  });
  await uploadBytes(normalizedPath, normalized, "image/png", {
    ui_slot: key,
    ui_role: definition.role,
    source_checksum_sha256: checksum,
    normalized_checksum_sha256: normalizedChecksum,
    approved_by: text(approvedBy) || "user",
    derivative: "crop_resize_only",
  });

  const manifest = await readManifest();
  const nextManifest = {
    ...manifest,
    contract: "AVANTIQO_INVESTOR_AUTHENTIC_UI_MANIFEST_V1",
    organization_id: ORGANIZATION_ID,
    source_policy: "USER_SUPPLIED_AUTHENTIC_AVANTIQO_UI_ONLY",
    synthetic_ui_allowed: false,
    browser_chrome_policy: "CROP_ONLY_DO_NOT_RECREATE_UI",
    updated_at: new Date().toISOString(),
    slots: {
      ...(manifest?.slots || {}),
      [key]: {
        slot: key,
        label: definition.label,
        role: definition.role,
        required: definition.required,
        approved_by: text(approvedBy) || "user",
        source_path: sourcePath,
        normalized_path: normalizedPath,
        original_file_name: originalName(file, key),
        source_mime_type: mime,
        source_bytes: bytes.length,
        source_width: sourceWidth,
        source_height: sourceHeight,
        source_checksum_sha256: checksum,
        crop: cropRect,
        normalized_width: NORMALIZED_WIDTH,
        normalized_height: NORMALIZED_HEIGHT,
        normalized_bytes: normalized.length,
        normalized_checksum_sha256: normalizedChecksum,
        transformation: "CROP_RESIZE_ONLY_NO_UI_REGENERATION",
        ingested_at: new Date().toISOString(),
      },
    },
  };
  await writeManifest(nextManifest);

  return {
    success: true,
    slot: key,
    label: definition.label,
    role: definition.role,
    source_path: sourcePath,
    normalized_path: normalizedPath,
    source_checksum_sha256: checksum,
    normalized_checksum_sha256: normalizedChecksum,
    crop: cropRect,
    dimensions: {
      source: { width: sourceWidth, height: sourceHeight },
      normalized: { width: NORMALIZED_WIDTH, height: NORMALIZED_HEIGHT },
    },
    preview_url: await signedUrl(normalizedPath),
    manifest_path: MANIFEST_PATH,
  };
}

export const AvantiqoInvestorUiIngestionRuntime = Object.freeze({
  slots: getAvantiqoInvestorUiSlots,
  status: getAvantiqoInvestorUiIngestionStatus,
  ingest: ingestAvantiqoInvestorUiFrame,
  manifest_path: MANIFEST_PATH,
  root: ROOT,
});
