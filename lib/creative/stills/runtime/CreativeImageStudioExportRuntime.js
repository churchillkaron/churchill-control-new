import sharp from "sharp";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { measureImageStudioText } from "./CreativeImageStudioTypographyRuntime.js";
import { clipImageStudioCompositePlacement, imageStudioSourceCropGeometry, rotatedImageStudioPlacement } from "./CreativeImageStudioImageGeometryRuntime.js";
import { materializeImageStudioFont } from "./CreativeImageStudioFontRuntime.js";
import { normalizeImageStudioEffects } from "./CreativeImageStudioEffectsRuntime.js";
import { applyImageStudioPixelAdjustments, normalizeImageStudioAdjustments } from "./CreativeImageStudioAdjustmentRuntime.js";
import { imageStudioCurvesAreIdentity } from "./CreativeImageStudioCurvesRuntime.js";
import { imageStudioColorGradeIsIdentity } from "./CreativeImageStudioColorGradeRuntime.js";
import { applyImageStudioRetouchOperations } from "./CreativeImageStudioRetouchRuntime.js";
import { imageStudioMaskGeometry } from "./CreativeImageStudioReusableDesignRuntime.js";
import { adjustmentLayersForTarget, applyImageStudioAdjustmentLayers, validateImageStudioAdjustmentMask } from "./CreativeImageStudioAdjustmentLayerRuntime.js";
import { applyImageStudioEdgeIntegration } from "./CreativeImageStudioEdgeIntegrationRuntime.js";
import { applyImageStudioLightWrap, imageStudioShadowSpec } from "./CreativeImageStudioContactRealismRuntime.js";
import { normalizeImageStudioTextureIntegration, buildImageStudioGrainTile } from "./CreativeImageStudioTextureIntegrationRuntime.js";
import { semanticMaskAlphaForPixel, validateImageStudioSemanticMask } from "./CreativeImageStudioSemanticMaskRuntime.js";
import { imageStudioBrushStrokeSvg, normalizeImageStudioBrushStrokes } from "./CreativeImageStudioBrushMaskRuntime.js";

function esc(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;",
  })[char]);
}

function num(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

async function buildImageStudioMaskBuffer(geometry,width,height){
  const feather=Math.max(0,Number(geometry.feather||0));
  const opacity=Math.max(0,Math.min(1,Number(geometry.opacity??1)));
  let mask;
  const shape=String(geometry.shape||"RECT").toUpperCase();
  const x=Math.max(0,geometry.x),y=Math.max(0,geometry.y),w=Math.max(0,geometry.width),h=Math.max(0,geometry.height);
  let shapeSvg;
  if(shape==="ELLIPSE") shapeSvg=`<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" fill="white" fill-opacity="${opacity}"/>`;
  else shapeSvg=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${shape==="ROUNDED_RECT"?geometry.radius||0:0}" ry="${shape==="ROUNDED_RECT"?geometry.radius||0:0}" fill="white" fill-opacity="${opacity}"/>`;
  if(geometry.invert){
    const inverseShape=shape==="ELLIPSE"
      ?`<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}"/>`
      :`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${shape==="ROUNDED_RECT"?geometry.radius||0:0}" ry="${shape==="ROUNDED_RECT"?geometry.radius||0:0}"/>`;
    mask=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><mask id="cut"><rect width="100%" height="100%" fill="white"/><g fill="black">${inverseShape}</g></mask><rect width="100%" height="100%" fill="white" opacity="${opacity}" mask="url(#cut)"/></svg>`);
  }else{
    mask=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${shapeSvg}</svg>`);
  }
  let bytes=await sharp(mask).png().toBuffer();
  if(feather>0) bytes=await sharp(bytes).blur(Math.max(.3,feather)).png().toBuffer();
  return bytes;
}

async function semanticAlphaMaskFromBuffer(input,width,height,metadata={}){
  const raw=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const channels=raw.info.channels;
  const out=Buffer.alloc(width*height*4);
  const opacity=Math.max(0,Math.min(1,Number(metadata.mask_opacity??1)));
  const invert=metadata.mask_invert===true;
  for(let i=0,p=0;i<raw.data.length;i+=channels,p+=4){
    const alpha=semanticMaskAlphaForPixel({r:raw.data[i],g:raw.data[i+1],b:raw.data[i+2],a:channels>3?raw.data[i+3]:255},metadata);
    const resolved=Math.round((invert?255-alpha:alpha)*opacity);
    out[p]=255;out[p+1]=255;out[p+2]=255;out[p+3]=resolved;
  }
  let bytes=await sharp(out,{raw:{width,height,channels:4}}).png().toBuffer();
  const feather=Math.max(0,Number(metadata.mask_feather||0));
  if(feather>0) bytes=await sharp(bytes).blur(Math.max(.3,feather)).png().toBuffer();
  return bytes;
}

async function semanticExternalMatteBuffer({organization_id,maskLayer,geometry,width,height}){
  const validation=validateImageStudioSemanticMask(maskLayer,{id:maskLayer.metadata?.clip_mask_target_id,source_asset_id:maskLayer.metadata?.semantic_source_asset_id});
  if(!validation.ready) throw new Error(`IMAGE_STUDIO_SEMANTIC_MASK_NOT_READY:${validation.failures.join(",")}`);
  const reference=String(maskLayer.metadata?.semantic_matte_storage_reference||"").trim();
  if(!reference.startsWith("storage://")) throw new Error(`IMAGE_STUDIO_SEMANTIC_MASK_STORAGE_REFERENCE_REQUIRED:${maskLayer.id}`);
  const signedUrl=await signCreativeStorageReference({organization_id,reference,expires_in:900});
  const input=await fetchImage(signedUrl);
  let prepared=await sharp(input).resize(geometry.renderedWidth,geometry.renderedHeight,{fit:"fill"}).extract({left:geometry.coverLeft,top:geometry.coverTop,width:geometry.scaledWidth,height:geometry.scaledHeight}).png().toBuffer();
  if(geometry.zoom>1) prepared=await sharp(prepared).extract({left:geometry.extractLeft,top:geometry.extractTop,width,height}).png().toBuffer();
  const gray=await sharp(prepared).greyscale().raw().toBuffer({resolveWithObject:true});
  const out=Buffer.alloc(width*height*4);
  const opacity=Math.max(0,Math.min(1,Number(maskLayer.metadata?.mask_opacity??1)));
  const invert=maskLayer.metadata?.mask_invert===true;
  for(let i=0,p=0;i<gray.data.length;i+=gray.info.channels,p+=4){
    const value=gray.data[i];
    const alpha=Math.round((invert?255-value:value)*opacity);
    out[p]=255;out[p+1]=255;out[p+2]=255;out[p+3]=alpha;
  }
  let bytes=await sharp(out,{raw:{width,height,channels:4}}).png().toBuffer();
  const feather=Math.max(0,Number(maskLayer.metadata?.mask_feather||0));
  if(feather>0) bytes=await sharp(bytes).blur(Math.max(.3,feather)).png().toBuffer();
  return bytes;
}

async function applyImageStudioBrushMaskRefinements(maskBuffer,maskLayer,geometry,width,height){
  const strokes=normalizeImageStudioBrushStrokes(maskLayer.metadata?.mask_brush_strokes||[]);
  if(!strokes.length)return maskBuffer;
  const base=await sharp(maskBuffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const channels=base.info.channels;
  const region={x:geometry.x||0,y:geometry.y||0,width:geometry.width||width,height:geometry.height||height};
  for(const stroke of strokes){
    const influenceSvg=Buffer.from(imageStudioBrushStrokeSvg(stroke,region,width,height));
    const influence=await sharp(influenceSvg).greyscale().raw().toBuffer({resolveWithObject:true});
    for(let p=0,i=0;p<width*height;p++,i+=channels){
      const strength=(influence.data[p]||0)/255;
      if(strength<=0)continue;
      const alpha=base.data[i+3];
      base.data[i+3]=Math.round(stroke.mode==="ADD"
        ? alpha+(255-alpha)*strength
        : alpha*(1-strength));
      base.data[i]=255;base.data[i+1]=255;base.data[i+2]=255;
    }
  }
  return sharp(base.data,{raw:{width,height,channels}}).png().toBuffer();
}

async function buildImageStudioBloomLayer(input,width,height,settings){
  if(settings.bloom_strength<=0||settings.bloom_radius_px<=0)return null;
  const raw=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const out=Buffer.alloc(width*height*4);
  const threshold=settings.bloom_threshold*255;
  for(let p=0,i=0;p<width*height;p++,i+=raw.info.channels){
    const r=raw.data[i],g=raw.data[i+1],b=raw.data[i+2],a=raw.data[i+3];
    const luminance=.2126*r+.7152*g+.0722*b;
    const weight=luminance<=threshold?0:Math.min(1,(luminance-threshold)/Math.max(1,255-threshold));
    const alpha=Math.round(a*weight*settings.bloom_strength);
    const o=p*4;out[o]=r;out[o+1]=g;out[o+2]=b;out[o+3]=alpha;
  }
  if(!out.some((value,index)=>index%4===3&&value>0))return null;
  return sharp(out,{raw:{width,height,channels:4}}).blur(Math.max(.3,settings.bloom_radius_px)).png().toBuffer();
}

async function applyImageStudioTextureFinishing(input,style={}){
  const settings=normalizeImageStudioTextureIntegration(style);
  let rendered=input;
  if(settings.sharpen_sigma>0)rendered=await sharp(rendered).sharpen(settings.sharpen_sigma).png().toBuffer();
  const meta=await sharp(rendered).metadata();
  const width=Math.max(1,meta.width||1),height=Math.max(1,meta.height||1);
  const bloom=await buildImageStudioBloomLayer(rendered,width,height,settings);
  if(bloom)rendered=await sharp(rendered).composite([{input:bloom,blend:"screen"}]).png().toBuffer();
  if(settings.grain_amount>0){
    const tile=buildImageStudioGrainTile(style,1024);
    const tilePng=await sharp(tile.bytes,{raw:{width:tile.width,height:tile.height,channels:tile.channels}}).png().toBuffer();
    rendered=await sharp(rendered).composite([{input:tilePng,tile:true,blend:"overlay"}]).png().toBuffer();
  }
  return {bytes:rendered,settings};
}

async function buildImageStudioGroundShadow(input,width,height,spec){
  if(!spec?.enabled)return null;
  const scaledHeight=Math.max(1,Math.round(height*spec.scale_y));
  const alphaRaw=await sharp(input).ensureAlpha().extractChannel(3).resize(width,scaledHeight,{fit:"fill"}).raw().toBuffer({resolveWithObject:true});
  const rgba=Buffer.alloc(width*height*4);
  const top=height-scaledHeight;
  for(let y=0;y<scaledHeight;y++)for(let x=0;x<width;x++){
    const sourceIndex=(y*width+x)*alphaRaw.info.channels;
    const targetIndex=((y+top)*width+x)*4;
    rgba[targetIndex]=spec.color.r;
    rgba[targetIndex+1]=spec.color.g;
    rgba[targetIndex+2]=spec.color.b;
    rgba[targetIndex+3]=Math.round((alphaRaw.data[sourceIndex]||0)*spec.opacity);
  }
  let shadow=await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer();
  if(spec.blur_px>0)shadow=await sharp(shadow).blur(Math.max(.3,spec.blur_px)).png().toBuffer();
  return shadow;
}

async function applyImageStudioEffects(input, style = {}) {
  const effects = normalizeImageStudioEffects(style);
  let pipeline = sharp(input).ensureAlpha();
  if (effects.brightness !== 1 || effects.saturation !== 1 || effects.hue !== 0) {
    pipeline = pipeline.modulate({ brightness: effects.brightness, saturation: effects.saturation, hue: effects.hue });
  }
  if (effects.contrast !== 1) {
    pipeline = pipeline.linear(effects.contrast, 128 * (1 - effects.contrast));
  }
  let rendered = await pipeline.png().toBuffer();
  if (effects.grayscale > 0) {
    const gray = await sharp(rendered).greyscale().png().toBuffer();
    if (effects.grayscale >= 0.999) rendered = gray;
    else {
      const meta = await sharp(rendered).metadata();
      const mask = Buffer.from(`<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white" fill-opacity="${effects.grayscale}"/></svg>`);
      const grayAlpha = await sharp(gray).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
      rendered = await sharp(rendered).composite([{ input: grayAlpha, blend: "over" }]).png().toBuffer();
    }
  }
  const adjustment = normalizeImageStudioAdjustments(style);
  const adjustmentActive = adjustment.exposure !== 0 || adjustment.temperature !== 0 || adjustment.tint !== 0 || adjustment.shadows !== 0 || adjustment.highlights !== 0 || adjustment.levels.black !== 0 || adjustment.levels.gamma !== 1 || adjustment.levels.white !== 255 || !imageStudioCurvesAreIdentity(adjustment.curves) || !imageStudioColorGradeIsIdentity(adjustment.color_grade);
  if (adjustmentActive) {
    const rawResult = await sharp(rendered).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const adjusted = applyImageStudioPixelAdjustments(rawResult.data, rawResult.info.width, rawResult.info.height, rawResult.info.channels, style);
    rendered = await sharp(adjusted.bytes, { raw: { width: adjusted.width, height: adjusted.height, channels: adjusted.channels } }).png().toBuffer();
  }
  const retouchOperations = Array.isArray(style.retouch_operations) ? style.retouch_operations : [];
  if (retouchOperations.length) {
    const rawResult = await sharp(rendered).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const retouched = applyImageStudioRetouchOperations(rawResult.data, rawResult.info.width, rawResult.info.height, rawResult.info.channels, retouchOperations);
    rendered = await sharp(retouched.bytes, { raw: { width: retouched.width, height: retouched.height, channels: retouched.channels } }).png().toBuffer();
  }
  if (effects.blur > 0) rendered = await sharp(rendered).blur(Math.max(0.3, effects.blur)).png().toBuffer();
  if (effects.opacity < 1) {
    const meta = await sharp(rendered).metadata();
    const mask = Buffer.from(`<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white" fill-opacity="${effects.opacity}"/></svg>`);
    rendered = await sharp(rendered).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  }
  return { bytes: rendered, effects, adjustments: adjustment };
}

async function sourceAssets({ organization_id, creative_project_id, layers }) {
  const ids = [...new Set(layers.map((layer) => layer.source_asset_id).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin.from("creative_assets")
    .select("id,image_url,file_url,thumbnail_url,organization_id,creative_project_id")
    .eq("organization_id", organization_id).in("id", ids);
  if (error) throw error;
  return new Map((data || [])
    .filter((asset) => !asset.creative_project_id || asset.creative_project_id === creative_project_id)
    .map((asset) => [asset.id, asset]));
}

async function fetchImage(url) {
  if (!/^https?:\/\//i.test(String(url || ""))) {
    throw new Error("IMAGE_STUDIO_EXPORT_SOURCE_URL_UNSUPPORTED");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`IMAGE_STUDIO_EXPORT_SOURCE_FETCH_FAILED:${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function renderFontFaces(bindings) {
  if (!bindings?.size) return "";
  const rules = [...bindings.values()].map((binding) => `@font-face{font-family:'${String(binding.css_family).replaceAll("'", "\\'")}';src:url('${binding.data_url}') format('truetype');font-style:normal;font-weight:100 900;}`).join("\n");
  return `<defs><style><![CDATA[${rules}]]></style></defs>`;
}

async function exactFontBindings({ organization_id, creative_project_id, layers }) {
  const ids = [...new Set(layers.filter((layer) => layer.layer_type === "TEXT").map((layer) => String(layer.style?.font_asset_id || "").trim()).filter(Boolean))];
  const bindings = new Map();
  for (const font_asset_id of ids) {
    const font = await materializeImageStudioFont({ organization_id, creative_project_id, font_asset_id });
    bindings.set(font_asset_id, { ...font, data_url: `data:${font.mime_type || "font/ttf"};base64,${font.bytes.toString("base64")}` });
  }
  return bindings;
}

function textSvg(layer, fontBindings) {
  const b = layer.bounds || {}, s = layer.style || {}, c = layer.content || {};
  const rotation = num(layer.transform?.rotation);
  const x = num(b.x), y = num(b.y);
  const width = Math.max(1, num(b.width, 240)), height = Math.max(1, num(b.height, 100));
  const fontAssetId = String(s.font_asset_id || "").trim();
  if (!fontAssetId) throw new Error(`IMAGE_STUDIO_EXPORT_FONT_ASSET_REQUIRED:${layer.id}`);
  const fontBinding = fontBindings.get(fontAssetId);
  if (!fontBinding) throw new Error(`IMAGE_STUDIO_EXPORT_FONT_BINDING_MISSING:${fontAssetId}`);
  const measured = measureImageStudioText({ text: c.text || "Text", bounds: { width, height }, style: s });
  const color = esc(s.color || "#111111");
  const anchor = measured.align === "center" ? "middle" : measured.align === "right" ? "end" : "start";
  const tx = anchor === "middle" ? x + width / 2 : anchor === "end" ? x + width : x;
  const tspans = measured.visibleLines.map((line, index) =>
    `<tspan x="${tx}" dy="${index ? measured.lineHeightPx : 0}">${esc(line)}</tspan>`).join("");
  const baselineY = y + measured.offsetY + measured.fontSize;
  return `<g transform="rotate(${rotation} ${x + width / 2} ${y + height / 2})">` +
    `<text x="${tx}" y="${baselineY}" font-family="${esc(fontBinding.css_family)}" ` +
    `font-size="${measured.fontSize}" font-weight="${measured.weight}" fill="${color}" text-anchor="${anchor}" ` +
    `letter-spacing="${measured.letterSpacing}">${tspans}</text></g>`;
}

export async function renderImageStudioMaster({
  organization_id, creative_project_id, artboard, layers = [], format = "PNG",
}) {
  if (!organization_id || !creative_project_id || !artboard?.id) {
    throw new Error("IMAGE_STUDIO_EXPORT_SCOPE_REQUIRED");
  }
  const unapprovedSemanticMattes=layers.filter((layer)=>
    layer.layer_type==="MASK" &&
    layer.metadata?.mask_source_kind==="SEMANTIC" &&
    ["SUBJECT","BACKGROUND"].includes(String(layer.metadata?.semantic_mask_mode||"").toUpperCase()) &&
    layer.metadata?.semantic_status==="READY_MATTE" &&
    layer.metadata?.semantic_review_approved!==true
  );
  if(unapprovedSemanticMattes.length){
    throw new Error(`IMAGE_STUDIO_EXPORT_SEMANTIC_MASK_REVIEW_REQUIRED:${unapprovedSemanticMattes.map((layer)=>layer.id).join(",")}`);
  }
  const layerById = new Map(layers.map((layer) => [layer.id, layer]));
  const visible = layers.filter((layer) => layer.visible !== false && layer.metadata?.is_clip_mask !== true)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const assets = await sourceAssets({ organization_id, creative_project_id, layers });
  const fontBindings = await exactFontBindings({ organization_id, creative_project_id, layers: visible });
  const composites = [];
  const text = [];
  for (const layer of visible) {
    if (layer.layer_type === "TEXT") {
      text.push(textSvg(layer, fontBindings));
      continue;
    }
    if (layer.layer_type === "ADJUSTMENT" || layer.layer_type === "MASK") continue;
    if (!layer.source_asset_id) continue;
    const asset = assets.get(layer.source_asset_id);
    if (!asset) throw new Error(`IMAGE_STUDIO_EXPORT_ASSET_SCOPE_FAILED:${layer.source_asset_id}`);
    const url = asset.image_url || asset.file_url || asset.thumbnail_url;
    const input = await fetchImage(url);
    const b = layer.bounds || {};
    const sourceMetadata = await sharp(input).metadata();
    const geometry = imageStudioSourceCropGeometry(layer, { width: sourceMetadata.width, height: sourceMetadata.height });
    const { width, height, zoom, scaledWidth, scaledHeight, extractLeft, extractTop, maskRadius, renderedWidth, renderedHeight, coverLeft, coverTop } = geometry;
    let prepared = await sharp(input)
      .resize(renderedWidth, renderedHeight, { fit: "fill" })
      .extract({ left: coverLeft, top: coverTop, width: scaledWidth, height: scaledHeight })
      .png().toBuffer();
    if (zoom > 1) prepared = await sharp(prepared).extract({ left: extractLeft, top: extractTop, width, height }).png().toBuffer();
    if (maskRadius > 0) {
      const mask = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${maskRadius}" ry="${maskRadius}" fill="white"/></svg>`);
      prepared = await sharp(prepared).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
    }
    const clipMaskId = layer.metadata?.clip_mask_layer_id;
    if (clipMaskId) {
      const clipMaskLayer = layerById.get(clipMaskId);
      if (!clipMaskLayer) throw new Error(`IMAGE_STUDIO_EXPORT_CLIP_MASK_MISSING:${clipMaskId}`);
      const semanticValidation=validateImageStudioSemanticMask(clipMaskLayer,layer);
      const maskGeometry=imageStudioMaskGeometry(layer,clipMaskLayer);
      let maskBuffer;
      if(semanticValidation.semantic){
        if(!semanticValidation.ready) throw new Error(`IMAGE_STUDIO_SEMANTIC_MASK_NOT_READY:${semanticValidation.failures.join(",")}`);
        if(["SUBJECT","BACKGROUND"].includes(semanticValidation.mode)){
          maskBuffer=await semanticExternalMatteBuffer({organization_id,maskLayer:clipMaskLayer,geometry,width,height});
        }else{
          maskBuffer=await semanticAlphaMaskFromBuffer(prepared,width,height,clipMaskLayer.metadata||{});
        }
      }else if(!maskGeometry.visible&&!maskGeometry.invert){
        maskBuffer=await sharp({create:{width,height,channels:4,background:{r:255,g:255,b:255,alpha:0}}}).png().toBuffer();
      }else{
        maskBuffer=await buildImageStudioMaskBuffer(maskGeometry,width,height);
      }
      maskBuffer=await applyImageStudioBrushMaskRefinements(maskBuffer,clipMaskLayer,maskGeometry,width,height);
      prepared=await sharp(prepared).ensureAlpha().composite([{input:maskBuffer,blend:"dest-in"}]).png().toBuffer();
    }
    const edgeSettings=layer.style?.edge_integration||{};
    const edgeActive=Number(edgeSettings.matte_choke_px||0)!==0||Number(edgeSettings.edge_soften_px||0)>0||Number(edgeSettings.despill_strength||0)>0||Number(edgeSettings.decontaminate_strength||0)>0;
    if(edgeActive){
      const edgeRaw=await sharp(prepared).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const integrated=applyImageStudioEdgeIntegration(edgeRaw.data,edgeRaw.info.width,edgeRaw.info.height,edgeRaw.info.channels,layer.style||{});
      prepared=await sharp(integrated.bytes,{raw:{width:integrated.width,height:integrated.height,channels:integrated.channels}}).png().toBuffer();
    }
    const contactSettings=layer.style?.contact_realism||{};
    const lightWrapActive=Number(contactSettings.light_wrap_strength||0)>0&&Number(contactSettings.light_wrap_width_px||0)>0;
    if(lightWrapActive){
      const wrapRaw=await sharp(prepared).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const wrapped=applyImageStudioLightWrap(wrapRaw.data,wrapRaw.info.width,wrapRaw.info.height,wrapRaw.info.channels,layer.style||{});
      prepared=await sharp(wrapped.bytes,{raw:{width:wrapped.width,height:wrapped.height,channels:wrapped.channels}}).png().toBuffer();
    }
    const shadowSpec=imageStudioShadowSpec(layer.style||{});
    let shadowPrepared=await buildImageStudioGroundShadow(prepared,width,height,shadowSpec);
    const effected = await applyImageStudioEffects(prepared, layer.style || {});
    prepared = effected.bytes;
    const adjustmentLayers = adjustmentLayersForTarget(visible, layer.id);
    if (adjustmentLayers.length) {
      const rawResult = await sharp(prepared).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const maskAlphaByAdjustmentId={};
      for(const adjustmentLayer of adjustmentLayers){
        const adjustmentMaskId=adjustmentLayer.metadata?.adjustment_mask_layer_id;
        if(!adjustmentMaskId)continue;
        const adjustmentMaskLayer=layerById.get(adjustmentMaskId);
        const adjustmentMaskValidation=validateImageStudioAdjustmentMask(adjustmentLayer,adjustmentMaskLayer);
        if(!adjustmentMaskValidation.ready)throw new Error(`IMAGE_STUDIO_ADJUSTMENT_MASK_INVALID:${adjustmentMaskId}:${adjustmentMaskValidation.failures.join(",")}`);
        const semanticValidation=validateImageStudioSemanticMask(adjustmentMaskLayer,layer);
        const maskGeometry=imageStudioMaskGeometry(layer,adjustmentMaskLayer);
        let adjustmentMaskBuffer;
        if(semanticValidation.semantic){
          if(!semanticValidation.ready)throw new Error(`IMAGE_STUDIO_ADJUSTMENT_MASK_NOT_READY:${semanticValidation.failures.join(",")}`);
          if(["SUBJECT","BACKGROUND"].includes(semanticValidation.mode)){
            adjustmentMaskBuffer=await semanticExternalMatteBuffer({organization_id,maskLayer:adjustmentMaskLayer,geometry,width,height});
          }else{
            adjustmentMaskBuffer=await semanticAlphaMaskFromBuffer(prepared,width,height,adjustmentMaskLayer.metadata||{});
          }
        }else if(!maskGeometry.visible&&!maskGeometry.invert){
          adjustmentMaskBuffer=await sharp({create:{width,height,channels:4,background:{r:255,g:255,b:255,alpha:0}}}).png().toBuffer();
        }else{
          adjustmentMaskBuffer=await buildImageStudioMaskBuffer(maskGeometry,width,height);
        }
        adjustmentMaskBuffer=await applyImageStudioBrushMaskRefinements(adjustmentMaskBuffer,adjustmentMaskLayer,maskGeometry,width,height);
        const alphaRaw=await sharp(adjustmentMaskBuffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        const alpha=Buffer.alloc(width*height);
        for(let p=0,i=0;p<alpha.length;p++,i+=alphaRaw.info.channels)alpha[p]=alphaRaw.data[i+3];
        maskAlphaByAdjustmentId[adjustmentLayer.id]=alpha;
      }
      const adjusted = applyImageStudioAdjustmentLayers(rawResult.data, rawResult.info.width, rawResult.info.height, rawResult.info.channels, adjustmentLayers,maskAlphaByAdjustmentId);
      prepared = await sharp(adjusted.bytes, { raw: { width: adjusted.width, height: adjusted.height, channels: adjusted.channels } }).png().toBuffer();
    }
    const textureFinished=await applyImageStudioTextureFinishing(prepared,layer.style||{});
    prepared=textureFinished.bytes;
    const rotation = num(layer.transform?.rotation);
    if (rotation) {
      prepared = await sharp(prepared).rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      if(shadowPrepared)shadowPrepared=await sharp(shadowPrepared).rotate(rotation,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
    }
    const metadata = await sharp(prepared).metadata();
    const placement = rotatedImageStudioPlacement(layer, { width: metadata.width, height: metadata.height });
    const clipped = clipImageStudioCompositePlacement(placement, artboard);
    if (!clipped.visible) continue;
    if(shadowPrepared){
      const shadowMetadata=await sharp(shadowPrepared).metadata();
      const rawShadowPlacement=rotatedImageStudioPlacement(layer,{width:shadowMetadata.width,height:shadowMetadata.height});
      const shadowPlacement={...rawShadowPlacement,left:rawShadowPlacement.left+Math.round(shadowSpec.offset_x),top:rawShadowPlacement.top+Math.round(shadowSpec.offset_y)};
      const shadowClipped=clipImageStudioCompositePlacement(shadowPlacement,artboard);
      if(shadowClipped.visible){
        if(shadowClipped.width!==shadowPlacement.renderedWidth||shadowClipped.height!==shadowPlacement.renderedHeight){
          shadowPrepared=await sharp(shadowPrepared).extract({left:shadowClipped.extractLeft,top:shadowClipped.extractTop,width:shadowClipped.width,height:shadowClipped.height}).png().toBuffer();
        }
        const shadowComposite={input:shadowPrepared,left:shadowClipped.left,top:shadowClipped.top,blend:"over"};
        composites.push(shadowComposite);
      }
    }
    if (clipped.width !== placement.renderedWidth || clipped.height !== placement.renderedHeight) {
      prepared = await sharp(prepared).extract({ left: clipped.extractLeft, top: clipped.extractTop, width: clipped.width, height: clipped.height }).png().toBuffer();
    }
    const subjectComposite={ input: prepared, left: clipped.left, top: clipped.top, blend: effected.effects.sharp_blend_mode };
    composites.push(subjectComposite);
  }
  const width = Math.round(num(artboard.width, 1080));
  const height = Math.round(num(artboard.height, 1350));
  const background = artboard.background?.color || "#ffffff";
  if (text.length) {
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${renderFontFaces(fontBindings)}${text.join("")}</svg>`;
    composites.push({ input: Buffer.from(svg), left: 0, top: 0 });
  }
  const base = sharp({ create: { width, height, channels: 4, background } }).composite(composites);
  let bytes;
  let mime;
  let extension;
  const target = String(format || "PNG").toUpperCase();
  if (target === "JPEG") {
    bytes = await base.jpeg({ quality: 95 }).toBuffer();
    mime = "image/jpeg";
    extension = "jpg";
  } else if (target === "PDF") {
    const png = await base.png({ compressionLevel: 9 }).toBuffer();
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([width, height]);
    const image = await pdf.embedPng(png);
    page.drawImage(image, { x: 0, y: 0, width, height });
    bytes = Buffer.from(await pdf.save());
    mime = "application/pdf";
    extension = "pdf";
  } else {
    bytes = await base.png({ compressionLevel: 9 }).toBuffer();
    mime = "image/png";
    extension = "png";
  }
  return { contract: "CREATIVE_IMAGE_STUDIO_DETERMINISTIC_EXPORT_V2", format: target, width, height, mime_type: mime, file_extension: extension, bytes, typography: { exact_font_asset_ids: [...fontBindings.keys()], embedded_exact_fonts: true }, effects: { contract: "CREATIVE_IMAGE_STUDIO_EFFECTS_V2", non_destructive: true }, adjustments: { contract: "CREATIVE_IMAGE_STUDIO_ADJUSTMENT_V3", curves_contract: "CREATIVE_IMAGE_STUDIO_CURVES_V1", color_grade_contract: "CREATIVE_IMAGE_STUDIO_COLOR_GRADE_V1", non_destructive: true, deterministic_pixel_pipeline: true, rgb_channel_curves: true, color_balance: true, channel_mixer: true, selective_color: true }, retouch: { contract: "CREATIVE_IMAGE_STUDIO_RETOUCH_V2", non_destructive: true, bounded_region_operations: true }, edge_integration: { contract: "CREATIVE_IMAGE_STUDIO_EDGE_INTEGRATION_V1", non_destructive: true, matte_morphology: true, despill: true, decontamination: true }, contact_realism: { contract: "CREATIVE_IMAGE_STUDIO_CONTACT_REALISM_V1", non_destructive: true, light_wrap: true, ground_shadow: true }, texture_integration: { contract: "CREATIVE_IMAGE_STUDIO_TEXTURE_INTEGRATION_V1", non_destructive: true, sharpen: true, bloom: true, deterministic_grain: true }, adjustment_layers: { contract: "CREATIVE_IMAGE_STUDIO_ADJUSTMENT_LAYER_V2", non_destructive: true, explicit_target_scope: true, independent_masks: true, semantic_masks: true, brush_refinement: true }, masks: { contract: "CREATIVE_IMAGE_STUDIO_REUSABLE_DESIGN_V3", semantic_contract: "CREATIVE_IMAGE_STUDIO_SEMANTIC_MASK_V2", non_destructive: true, feather_invert_opacity: true, dedicated_mask_layers: true, mask_shapes: ["RECT","ROUNDED_RECT","ELLIPSE"], semantic_modes:["LUMINANCE","COLOR_RANGE","ALPHA","SUBJECT","BACKGROUND"], brush_refinement_contract:"CREATIVE_IMAGE_STUDIO_BRUSH_MASK_V1" } };
}

export const CreativeImageStudioExportRuntime = Object.freeze({ contract: "CREATIVE_IMAGE_STUDIO_DETERMINISTIC_EXPORT_V2", render: renderImageStudioMaster });

export default CreativeImageStudioExportRuntime;
// Compatibility marker: CREATIVE_IMAGE_STUDIO_DETERMINISTIC_EXPORT_V1
