import { createCodeAIDesignPreview } from "@/lib/code/runtime/CodeAIConversationRuntime";
export const runtime = "nodejs";
export async function GET() {
  if (process.env.NODE_ENV !== "development") return new Response(null,{status:404});
  const result = await createCodeAIDesignPreview({
    organizationId:"9a148429-b6a0-4bc6-ac83-a35c64fb7045",
    message:"can you show me design for a finance page",
    recentConversation:[],
    workspace:{},
  });
  return Response.json(result);
}
