export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { runAIService } from "@/lib/platform/service-runtime/ai";
import { authorizeInvestorV9Render } from "@/lib/investor-film/InvestorV9RenderAuth";

const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const ROOT = `${ORG}/${PROJECT}/spatial-master-v9/qc`;
const CORE = Object.freeze([
  { key: "business_partner", path: `${ROOT}/business_partner.jpg`, role: "BUSINESS PARTNER / DIGITAL TWIN" },
  { key: "communication", path: `${ROOT}/communication.jpg`, role: "COMMUNICATION INTELLIGENCE" },
  { key: "cross_domain", path: `${ROOT}/cross_domain.jpg`, role: "CROSS-DOMAIN / INDUSTRY / GOVERNANCE" },
  { key: "studio_marketing", path: `${ROOT}/studio_marketing.jpg`, role: "CREATIVE STUDIO / AUTONOMOUS MARKETING" },
]);

function json(value, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store, private" } });
}

async function signed(storagePath) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`V9_VISION_SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

function unwrap(value = {}) {
  let current = value?.output || value;
  const seen = new Set();
  while (current && typeof current === "object" && current.output && typeof current.output === "object" && !seen.has(current)) {
    seen.add(current);
    current = current.output;
  }
  return current || {};
}

function parseReview(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const source = String(value || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(source);
}

function prompt() {
  return `
You are Avantiqo Creative Studio's senior film dailies director and VFX finishing supervisor.
You are reviewing FOUR contact sheets from the investor/promo film. Image order is fixed:
1 BUSINESS PARTNER / DIGITAL TWIN
2 COMMUNICATION INTELLIGENCE
3 CROSS-DOMAIN / INDUSTRY / GOVERNANCE
4 CREATIVE STUDIO / AUTONOMOUS MARKETING
Each sheet contains labeled sampled frames in chronological order.

This is a hard release gate for a premium investor film. Do not encourage weak work. If a defect is visible or plausibly severe from the sampled progression, flag it precisely. Do not invent defects that are not visible.

The required visual standard is world-class premium cinema: restrained graphite/titanium/black architecture, champagne-gold/white intelligence, high-end glass/spatial interfaces physically anchored in space, believable lighting/materials, natural human anatomy and movement, and authentic product UI. Futuristic is desirable only when physically coherent and expensive-looking.

HARD FAIL DEFECTS:
- a person appearing to emerge through a wall, counter, furniture, closed surface or impossible path,
- duplicated/half bodies, anatomy failures, broken hands/faces/limbs, body intersections,
- physical tablets/iPads/screens floating unsupported in ordinary space,
- spatial glass/hologram that reads like an accidental floating tablet instead of intentional premium VFX,
- melting/warped architecture, impossible doors/counters/kitchen equipment,
- fake or unreadable UI presented as proof, malformed logos, invented provider logos,
- cheap neon-blue sci-fi HUD, generic AI orb/brain/robot/Matrix visual language,
- text clutter, Canva-like cards, poor hierarchy, or overlays covering faces/actions,
- discontinuity that makes a person/object teleport or enter from an impossible direction,
- obvious synthetic artifacts that break investor trust.

For CREATIVE STUDIO / AUTONOMOUS MARKETING be especially strict: it must look like a top global film/creative agency showing a world-class Studio, not a generic AI ad maker.
For COMMUNICATION, channel/provider marks must look deliberate and premium, not like a logo wall.
For BUSINESS PARTNER, holographic/spatial intelligence must feel physically anchored and sophisticated.
For CROSS-DOMAIN, kitchen/operations scenes must have plausible devices, work surfaces and human movement.

Score every sheet 0-100 for:
- cinematic_quality
- spatial_coherence
- anatomy_integrity
- interface_authenticity
- premium_design
- synthetic_artifact_freedom
- investor_trust

PASS thresholds for EACH sheet:
cinematic_quality >= 90
spatial_coherence >= 92
anatomy_integrity >= 95
interface_authenticity >= 90
premium_design >= 92
synthetic_artifact_freedom >= 94
investor_trust >= 92
and zero hard_fail issues.

Return STRICT JSON only:
{
  "contract":"AVANTIQO_INVESTOR_V9_WORLD_CLASS_VISION_GATE_V1",
  "verdict":"PASS|FAIL",
  "world_class_ready":true,
  "hard_fail_count":0,
  "sections":[
    {
      "key":"business_partner|communication|cross_domain|studio_marketing",
      "verdict":"PASS|FAIL",
      "scores":{"cinematic_quality":0,"spatial_coherence":0,"anatomy_integrity":0,"interface_authenticity":0,"premium_design":0,"synthetic_artifact_freedom":0,"investor_trust":0},
      "hard_fail_issues":[{"sample_label":"visible time label or frame position","issue":"specific visible defect","severity":"BLOCKER|MAJOR"}],
      "strengths":[],
      "issues":[],
      "repair_instructions":[]
    }
  ],
  "cross_section_continuity_issues":[],
  "release_blockers":[],
  "finishing_recommendations":[],
  "summary":"specific release conclusion"
}
`;
}

export async function GET(request) {
  if (!(await authorizeInvestorV9Render(request))) return json({ success: false, error: "UNAUTHORIZED" }, 401);
  try {
    const urls = [];
    for (const item of CORE) urls.push(await signed(item.path));

    const execution = await runAIService.execute({
      organization_id: ORG,
      bill_to_organization_id: ORG,
      entity_id: ENTITY,
      service_id: "ai.image.analyze",
      provider_id: "openai",
      input: {
        capability: "ai.image.analyze",
        model: "gpt-4.1-mini",
        assets: urls,
        quantity: 1,
        prompt: prompt(),
        temperature: 0,
        max_output_tokens: 6500,
      },
      metadata: {
        module: "CREATIVE",
        operation: "AVANTIQO_INVESTOR_V9_WORLD_CLASS_VISION_GATE",
        creative_project_id: PROJECT,
        evidence_paths: CORE.map((item) => item.path),
      },
      category: "AI",
    });

    if (execution?.pending) throw new Error("V9_VISION_REVIEW_ASYNC_NOT_SUPPORTED");
    const providerOutput = unwrap(execution);
    const raw = providerOutput?.text || providerOutput?.content || providerOutput?.result || providerOutput;
    const review = parseReview(raw);
    return json({ success: true, contract: "AVANTIQO_INVESTOR_V9_WORLD_CLASS_VISION_GATE_V1", evidence: CORE, review });
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
