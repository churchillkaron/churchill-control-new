import crypto from "node:crypto";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";
import {
  composeCreativeDesignDocument,
} from "./CreativeDesignCompositionRuntime.js";
import {
  bindCreativeDesignDocument,
} from "./CreativeDesignDataBindingRuntime.js";
import {
  layoutCreativeDesignTables,
} from "./CreativeDesignTableLayoutRuntime.js";
import {
  inspectCreativeDesignCollisions,
} from "./CreativeDesignCollisionRuntime.js";
import {
  paginateCreativeDesignDocument,
} from "./CreativeDesignPaginationRuntime.js";
import {
  validateCreativeDesignPrintProfile,
} from "./CreativeDesignPrintProfileRuntime.js";
import {
  inspectCreativeDesignDocument,
} from "./CreativeDesignQualityRuntime.js";
import {
  adaptCreativeDesignDocument,
} from "./CreativeDesignAdaptationRuntime.js";
import {
  materializeCreativeDesignFonts,
} from "./CreativeDesignFontMaterializationRuntime.js";
import {
  materializeCreativeDesignAssets,
} from "./CreativeDesignAssetMaterializationRuntime.js";
import {
  renderCreativeDesignDocumentToSvg,
} from "./CreativeDesignSvgRenderer.js";
import {
  renderCreativeDesignDocumentToPng,
} from "./CreativeDesignPngRenderer.js";
import {
  renderCreativeDesignDocumentToPdf,
} from "./CreativeDesignPdfRenderer.js";

const CONTRACT = "CREATIVE_DESIGN_PRODUCTION_TASK_RUNTIME_V4";
const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.design.production-task-runtime.v1",
);
const supabaseAdmin = getServiceSupabase();

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function capability(task = {}) {
  return text(task.capability || task.service_code || task.service_id).toLowerCase();
}

export function isCreativeDesignProductionTask(task = {}) {
  return capability(task).startsWith("creative.design.");
}

function unwrapDocument(value, depth = 0) {
  if (!value || depth > 8) return null;
  if (value.contract === "CREATIVE_DESIGN_DOCUMENT_V1" && Array.isArray(value.pages)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = unwrapDocument(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const preferred = [
    value.design_document,
    value.structured_design_document,
    value.document,
    value.output,
    value.result,
  ];
  for (const child of preferred) {
    const found = unwrapDocument(child, depth + 1);
    if (found) return found;
  }
  for (const child of Object.values(value)) {
    const found = unwrapDocument(child, depth + 1);
    if (found) return found;
  }
  return null;
}

async function documentForTask(task) {
  const direct = unwrapDocument(task.input);
  if (direct) return validateCreativeDesignDocument(direct);

  for (const dependencyId of list(task.depends_on)) {
    const dependency = await ProductionTaskRuntime.get(dependencyId);
    const found = unwrapDocument(dependency?.output);
    if (found) return validateCreativeDesignDocument(found);
  }
  throw new Error("CREATIVE_DESIGN_DOCUMENT_REQUIRED");
}

function specificationForComposeTask(task = {}) {
  const input = object(task.input);
  return object(
    input.design_specification ||
    input.structured_specification ||
    input.specification ||
    input.requirements?.design_specification ||
    input.requirements?.structured_specification,
  );
}

function safe(value, fallback = "design") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function renderBucket(task) {
  return text(
    task.input?.storage_policy?.bucket ||
    task.metadata?.storage_policy?.bucket ||
    process.env.CREATIVE_DESIGN_RENDER_BUCKET ||
    process.env.CREATIVE_MEDIA_RENDER_BUCKET,
  );
}

async function uploadBuffer({ task, extension, mimeType, buffer, identity, suffix = null }) {
  const bucket = renderBucket(task);
  if (!bucket) throw new Error("CREATIVE_DESIGN_STORAGE_BUCKET_REQUIRED");
  const file = `${identity}${suffix ? `-${safe(suffix)}` : ""}.${extension}`;
  const storagePath = [
    safe(task.organization_id),
    safe(task.creative_project_id),
    "design",
    safe(task.metadata?.deliverable_id || task.id),
    file,
  ].join("/");
  const { error } = await supabaseAdmin.storage.from(bucket).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error && error.statusCode !== "409" && error.status !== 409) throw error;
  return {
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
    mime_type: mimeType,
    file_size_bytes: buffer.length,
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

function renderIdentity(task, document, kind) {
  return crypto.createHash("sha256").update(JSON.stringify({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    deliverable_id: task.metadata?.deliverable_id || null,
    document_hash: document.document_hash,
    capability: kind,
    output_spec: task.input?.output_spec || {},
  })).digest("hex");
}

async function withRenderMaterials(task, document, work) {
  const mediaPolicy = object(task.input?.media_policy || task.metadata?.media_policy);
  const [fonts, assets] = await Promise.all([
    materializeCreativeDesignFonts({ document, media_policy: mediaPolicy }),
    materializeCreativeDesignAssets({ document, media_policy: mediaPolicy }),
  ]);

  try {
    return await work({
      fontBindings: fonts.bindings,
      fontEvidence: fonts.evidence,
      assetBindings: assets.bindings,
      assetEvidence: assets.evidence,
    });
  } finally {
    await Promise.allSettled([fonts.cleanup(), assets.cleanup()]);
  }
}

async function renderSvgTask(task, document) {
  return withRenderMaterials(task, document, async ({
    fontBindings,
    fontEvidence,
    assetBindings,
    assetEvidence,
  }) => {
    const rendered = renderCreativeDesignDocumentToSvg(document, {
      font_bindings: fontBindings,
      asset_bindings: assetBindings,
    });
    if (!rendered.success) throw new Error("CREATIVE_DESIGN_SVG_RENDER_REPAIR_REQUIRED");
    const identity = renderIdentity(task, document, "svg");
    const files = [];
    for (const page of rendered.pages) {
      const uploaded = await uploadBuffer({
        task,
        extension: "svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(page.svg, "utf8"),
        identity,
        suffix: page.page_id,
      });
      files.push({ ...uploaded, page_id: page.page_id });
    }
    return {
      type: "ASSET",
      name: `${document.title}.svg`,
      url: files[0]?.url || null,
      file_url: files[0]?.url || null,
      files,
      document_hash: document.document_hash,
      font_evidence: fontEvidence,
      asset_evidence: assetEvidence,
      render_evidence: rendered.pages.map((page) => ({
        page_id: page.page_id,
        evidence: page.evidence,
      })),
      exact_visual_assets_embedded: rendered.exact_visual_assets_embedded,
      deterministic: true,
      provider_called: false,
    };
  });
}

async function renderPngTask(task, document) {
  return withRenderMaterials(task, document, async ({
    fontBindings,
    fontEvidence,
    assetBindings,
    assetEvidence,
  }) => {
    const rendered = await renderCreativeDesignDocumentToPng(document, {
      font_bindings: fontBindings,
      asset_bindings: assetBindings,
      density: task.input?.density || task.input?.output_spec?.density || 300,
    });
    if (!rendered.success) throw new Error("CREATIVE_DESIGN_PNG_RENDER_REPAIR_REQUIRED");
    const identity = renderIdentity(task, document, "png");
    const files = [];
    for (const page of rendered.pages) {
      const uploaded = await uploadBuffer({
        task,
        extension: "png",
        mimeType: "image/png",
        buffer: page.buffer,
        identity,
        suffix: page.page_id,
      });
      files.push({ ...uploaded, page_id: page.page_id });
    }
    return {
      type: "ASSET",
      name: `${document.title}.png`,
      url: files[0]?.url || null,
      file_url: files[0]?.url || null,
      files,
      document_hash: document.document_hash,
      font_evidence: fontEvidence,
      asset_evidence: assetEvidence,
      deterministic: true,
      provider_called: false,
    };
  });
}

async function renderPdfTask(task, document) {
  return withRenderMaterials(task, document, async ({
    fontBindings,
    fontEvidence,
    assetBindings,
    assetEvidence,
  }) => {
    const rendered = await renderCreativeDesignDocumentToPdf(document, {
      font_bindings: fontBindings,
      asset_bindings: assetBindings,
      density: task.input?.density || task.input?.output_spec?.density || 300,
    });
    const identity = renderIdentity(task, document, "pdf");
    const uploaded = await uploadBuffer({
      task,
      extension: "pdf",
      mimeType: "application/pdf",
      buffer: rendered.buffer,
      identity,
    });
    return {
      type: "ASSET",
      name: `${document.title}.pdf`,
      url: uploaded.url,
      file_url: uploaded.url,
      ...uploaded,
      document_hash: document.document_hash,
      page_count: rendered.page_count,
      color_space: rendered.color_space,
      cmyk_certified: rendered.cmyk_certified,
      pdfx_certified: rendered.pdfx_certified,
      font_evidence: fontEvidence,
      asset_evidence: assetEvidence,
      deterministic: true,
      provider_called: false,
    };
  });
}

async function executeLocal(task) {
  const id = capability(task);

  if (id === "creative.design.compose") {
    const specification = specificationForComposeTask(task);
    if (!Object.keys(specification).length) {
      throw new Error("CREATIVE_DESIGN_COMPOSE_SPECIFICATION_REQUIRED");
    }
    const composed = composeCreativeDesignDocument({
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
      creative_mission_id: task.metadata?.creative_mission_id || null,
      specification,
    });
    return { ...composed, design_document: composed.document };
  }

  const document = await documentForTask(task);
  if (id === "creative.design.data.bind") {
    return bindCreativeDesignDocument(
      document,
      object(task.input?.governed_sources || task.input?.data_sources),
    );
  }
  if (id === "creative.design.validate") {
    return inspectCreativeDesignDocument(document, object(task.input?.render_options));
  }
  if (id === "creative.design.layout.table") return layoutCreativeDesignTables(document);
  if (id === "creative.design.layout.inspect") {
    return inspectCreativeDesignCollisions(document, object(task.input?.collision_options));
  }
  if (id === "creative.design.paginate") {
    const paginated = paginateCreativeDesignDocument(document);
    return { ...paginated, design_document: paginated.document };
  }
  if (id === "creative.design.print.validate") return validateCreativeDesignPrintProfile(document);
  if (id === "creative.design.adapt") {
    return adaptCreativeDesignDocument(
      document,
      object(task.input?.target || task.input?.output_spec),
    );
  }
  if (id === "creative.design.render.svg") return renderSvgTask(task, document);
  if (id === "creative.design.render.png") return renderPngTask(task, document);
  if (id === "creative.design.render.pdf") return renderPdfTask(task, document);
  throw new Error(`CREATIVE_DESIGN_CAPABILITY_UNSUPPORTED:${id}`);
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const originalDispatch = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithCreativeDesign(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task || !isCreativeDesignProductionTask(task)) return originalDispatch(id);
    if (task.status === "COMPLETED" || task.status === "FAILED") return task;

    await ProductionTaskRuntime.update(id, {
      status: "RUNNING",
      timing: {
        ...(task.timing || {}),
        started_at: task.timing?.started_at || new Date().toISOString(),
      },
      metadata: {
        ...(task.metadata || {}),
        local_design_execution: true,
        provider_selection_exposed: false,
        wallet_charge_required: false,
        exact_asset_materialization_required: true,
      },
    });

    try {
      const output = await executeLocal(task);
      return ProductionTaskRuntime.complete(id, {
        provider: "avantiqo-local-design-worker",
        settlement: "LOCAL_EXECUTION",
        pricing: null,
        usage: null,
        billing: null,
        output,
      });
    } catch (error) {
      return ProductionTaskRuntime.fail(id, error, {
        provider: "avantiqo-local-design-worker",
        settlement: "LOCAL_EXECUTION_FAILED",
      });
    }
  };
}

install();

export const CreativeDesignProductionTaskRuntime = Object.freeze({
  contract: CONTRACT,
  installed: true,
  local_execution: true,
  provider_called: false,
  wallet_charge_required: false,
  exact_asset_materialization_required: true,
  collision_inspection_available: true,
  deterministic_pagination_available: true,
  isDesignTask: isCreativeDesignProductionTask,
});

export default CreativeDesignProductionTaskRuntime;
