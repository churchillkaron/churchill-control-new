import { addJob, getJobs } from "@/lib/shared/ubte/queue";

/**
 * UBTE QUEUE API
 */

export async function GET() {
  return Response.json({
    jobs: getJobs()
  });
}

export async function POST(req) {
  const body = await req.json();

  addJob(body);

  return Response.json({
    success: true
  });
}
