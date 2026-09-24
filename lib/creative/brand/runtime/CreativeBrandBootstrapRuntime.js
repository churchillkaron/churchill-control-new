import sharp from "sharp";
import { CreativeBrandRuntime } from "@/lib/creative/brand/runtime/CreativeBrandRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) { return String(value ?? "").trim(); }
function hex(value) { return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0").toUpperCase(); }
function rgbHex(r, g, b) { return `#${hex(r)}${hex(g)}${hex(b)}`; }
function luminance([r, g, b]) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }
function distance(a, b) { return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2); }

async function assetForOrganization({ organizationId, assetId }) {
  if (!assetId) return null;
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("id,name,file_name,image_url,file_url,metadata")
    .eq("organization_id", organizationId)
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("BRAND_ASSET_NOT_FOUND");
  return data;
}

function assetUrl(asset) {
  return asset?.image_url || asset?.file_url || null;
}

async function logoBuffer(asset) {
  const urls = [assetUrl(asset)].filter(Boolean);
  const storagePath = text(asset?.metadata?.storage_path || asset?.storage_path);
  if (storagePath) {
    const signed = await supabaseAdmin.storage.from("creative-assets").createSignedUrl(storagePath, 300);
    if (signed?.data?.signedUrl) urls.push(signed.data.signedUrl);
  }
  for (const url of urls) {
    const response = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (response?.ok) return Buffer.from(await response.arrayBuffer());
  }
  throw new Error("BRAND_LOGO_FETCH_FAILED");
}

async function analyzeLogo(asset) {
  const buffer = await logoBuffer(asset);
  const pipeline = sharp(buffer, { failOn: "none" }).rotate();
  const metadata = await pipeline.metadata();
  const { data, info } = await pipeline
    .resize({ width: 72, height: 72, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map();
  for (let index = 0; index < data.length; index += info.channels) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const a = data[index + 3] ?? 255;
    if (a < 80) continue;
    const key = `${Math.round(r/24)*24},${Math.round(g/24)*24},${Math.round(b/24)*24}`;
    buckets.set(key, (buckets.get(key) || 0) + a / 255);
  }

  const ranked = [...buckets.entries()]
    .map(([key, count]) => ({ rgb:key.split(",").map(Number), count }))
    .sort((a,b) => b.count-a.count);
  const chosen = [];
  for (const candidate of ranked) {
    const lum = luminance(candidate.rgb);
    const tooNeutral = lum > 0.965 || lum < 0.035;
    if (tooNeutral && chosen.length < 2) continue;
    if (chosen.every((item) => distance(item, candidate.rgb) >= 44)) chosen.push(candidate.rgb);
    if (chosen.length >= 5) break;
  }
  if (!chosen.length && ranked[0]) chosen.push(ranked[0].rgb);

  const colors = chosen.map((rgb) => rgbHex(...rgb));
  const primary = chosen[0] || [160,120,80];
  const primaryLum = luminance(primary);
  const typographyDirection = Number(metadata.width || 0) / Math.max(1, Number(metadata.height || 1)) >= 2.8
    ? "distinctive display or condensed sans-serif for brand headings; neutral humanist sans-serif for product UI and body copy"
    : "clean modern sans-serif with strong legibility; use display typography sparingly and keep product UI neutral";

  return {
    colors,
    primary_luminance: Number(primaryLum.toFixed(3)),
    recommended_surface: primaryLum < 0.42 ? "light" : "warm-light",
    typography_direction: typographyDirection,
    source_dimensions: { width: metadata.width || null, height: metadata.height || null },
    has_alpha: metadata.hasAlpha === true,
  };
}

function voiceForIndustry(industry) {
  const key = text(industry).toLowerCase();
  if (["restaurant","hospitality","hotel","nightlife","bar"].some((token) => key.includes(token))) {
    return "Warm, confident, hospitable and concise. Human rather than corporate; helpful without sounding scripted.";
  }
  if (["accounting","finance","legal"].some((token) => key.includes(token))) {
    return "Clear, precise, calm and trustworthy. Explain decisions plainly, avoid hype and distinguish facts from assumptions.";
  }
  if (["construction","operations","logistics","manufacturing"].some((token) => key.includes(token))) {
    return "Direct, capable and practical. Prioritize clarity, commitments, timing and operational facts.";
  }
  return "Clear, confident, human and professional. Concise by default, helpful without unnecessary marketing language.";
}

export const CreativeBrandBootstrapRuntime = Object.freeze({
  async bootstrap({ organizationId, primaryLogoAssetId = null, logoIconAssetId = null }) {
    const organizationResult = await supabaseAdmin
      .from("organizations")
      .select("id,name,industry")
      .eq("id", organizationId)
      .maybeSingle();
    if (organizationResult.error) throw organizationResult.error;
    const organization = organizationResult.data;
    if (!organization) throw new Error("ORGANIZATION_NOT_FOUND");

    const [primaryLogo, logoIcon] = await Promise.all([
      assetForOrganization({ organizationId, assetId: primaryLogoAssetId }),
      assetForOrganization({ organizationId, assetId: logoIconAssetId }),
    ]);
    const analysisSource = primaryLogo || logoIcon;
    if (!analysisSource) throw new Error("PRIMARY_LOGO_OR_ICON_REQUIRED");
    const analysis = await analyzeLogo(analysisSource);
    const voiceTone = voiceForIndustry(organization.industry);
    const existing = (await CreativeBrandRuntime.list({ organization_id: organizationId }))?.[0] || null;
    const metadata = {
      ...(existing?.metadata || {}),
      ...(logoIcon?.id ? { logo_icon_asset_id: logoIcon.id } : {}),
      brand_bootstrap: {
        version: "CREATIVE_BRAND_BOOTSTRAP_V1",
        derived_at: new Date().toISOString(),
        source_asset_id: analysisSource.id,
        source: "LOGO_DERIVED_RECOMMENDATION",
        confidence: "INITIAL_RECOMMENDATION",
        typography_direction: analysis.typography_direction,
        recommended_surface: analysis.recommended_surface,
        primary_luminance: analysis.primary_luminance,
        source_dimensions: analysis.source_dimensions,
        has_alpha: analysis.has_alpha,
      },
    };
    const values = {
      name: text(existing?.name) || text(organization.name),
      logo_asset_id: primaryLogo?.id || existing?.logo_asset_id || null,
      colors: analysis.colors,
      fonts: [analysis.typography_direction],
      voice_tone: voiceTone,
      style_keywords: ["brand-derived", "clear", "consistent"],
      reference_assets: [...new Set([...(existing?.reference_assets || []), primaryLogo?.id, logoIcon?.id].filter(Boolean))],
      metadata,
    };
    const brand = existing
      ? await CreativeBrandRuntime.update(existing.id, values)
      : await CreativeBrandRuntime.create({ organization_id: organizationId, ...values });
    return { brand, analysis };
  },
});
