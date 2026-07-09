import { execute } from "@/lib/ubte";

export async function POST(req) {
  const task = await req.json();

  const result = await execute({
    capability: task.capability,
    context: task.context,
    payload: task.payload
  });

  return Response.json({ success: true, result });
}
