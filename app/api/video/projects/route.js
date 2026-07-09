export const dynamic = "force-dynamic";

import {
  GET as CreativeProjectsGET,
  POST as CreativeProjectsPOST,
} from "@/app/api/creative/projects/route";

export async function GET(req) {
  return CreativeProjectsGET(req);
}

export async function POST(req) {
  return CreativeProjectsPOST(req);
}
