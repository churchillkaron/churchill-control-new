export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  addMusicArrangementSection,
  buildMusicArrangementTemplate,
  ensureMusicArrangement,
  removeMusicArrangementSection,
  updateMusicArrangementSection,
  validateMusicArrangement,
} from "@/lib/creative/music/runtime/CreativeMusicArrangementRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const KEY = "music_arrangement";
function text(value) { return String(value ?? "").trim(); }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: PERMISSIONS });
  if (!access.success) { const error = new Error(access.error || "CREATIVE_MUSIC_ARRANGEMENT_ACCESS_FORBIDDEN"); error.status = access.status || 403; throw error; }
}

async function projectInScope(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) { const error = new Error("CREATIVE_MUSIC_ARRANGEMENT_PROJECT_NOT_FOUND"); error.status = 404; throw error; }
  return project;
}

async function persist(project, arrangement) {
  validateMusicArrangement(arrangement);
  await CreativeProjectRepository.update(project.id, { metadata: { ...(project.metadata || {}), [KEY]: arrangement, music_arrangement_updated_at:new Date().toISOString() } });
  return arrangement;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    if (!organizationId) return NextResponse.json({success:false,error:"organization_id required"},{status:400});
    await requireAccess(request,organizationId);
    const project=await projectInScope(organizationId,projectId);
    const current=ensureMusicArrangement(project.metadata?.[KEY] || {});
    const action=text(body.action || "load").toLowerCase();
    if (action==="load") return NextResponse.json({success:true,contract:"AVANTIQO_MUSIC_ARRANGEMENT_API_V1",arrangement:current,provider_job_submitted:false,endpoint_mutation_performed:false},{headers:{"Cache-Control":"no-store"}});
    let next=current;
    if (action==="template") next=buildMusicArrangementTemplate(body.template || {});
    else if (action==="add_section") next=addMusicArrangementSection(current,body.section || {});
    else if (action==="update_section") next=updateMusicArrangementSection(current,text(body.section_id),body.section || {});
    else if (action==="remove_section") next=removeMusicArrangementSection(current,text(body.section_id));
    else throw new Error("CREATIVE_MUSIC_ARRANGEMENT_ACTION_INVALID");
    const saved=await persist(project,next);
    return NextResponse.json({success:true,contract:"AVANTIQO_MUSIC_ARRANGEMENT_API_V1",action,arrangement:saved,audio_changed:false,provider_job_submitted:false,endpoint_mutation_performed:false},{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    return NextResponse.json({success:false,error:error?.message || "Music arrangement failed",provider_job_submitted:false,endpoint_mutation_performed:false},{status:error?.status || 400});
  }
}
